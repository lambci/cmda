const tar = require('tar')
const S3 = require('aws-sdk/clients/s3')
const Lambda = require('aws-sdk/clients/lambda')
const { randomTgzName, strippedTarStream, pipePromise } = require('../shared/tar')
const { version } = require('../package.json')

/**
 * @param {{ functionName: string }} options
 */
exports.info = async function ({ functionName }) {
  const info = { cliVersion: version, ...(await invokeLambda(functionName, 'info')) }
  console.log(
    Object.keys(info)
      .map((key) => `${key}: ${info[key]}`)
      .join('\n')
  )
}

/**
 * @param {{ functionName: string, args: string[] }} options
 */
exports.exec = async function ({ functionName, args }) {
  const { status, stderr, stdout, error } = await invokeLambda(functionName, 'exec', {
    cmd: args[0],
    args: args.slice(1),
  })

  if (stdout) {
    process.stdout.write(Buffer.from(stdout, 'base64'))
  }

  if (stderr) {
    process.stderr.write(Buffer.from(stderr, 'base64'))
  }

  if (error) {
    if (error.code === 'ENOENT') {
      console.error(`command not found: ${args[0]}`)
      return process.exit(127)
    }
    /** @type {NodeJS.ErrnoException} */
    const err = new Error(error.message)
    err.name = error.name
    err.stack = error.stack
    err.code = error.code
    throw err
  }

  if (status !== 0) {
    process.exit(status)
  }
}

const MAX_RETRIES = 3

/**
 * @param {{ functionName: string, args: string[], bucket?: string, retries?: number }} options
 */
exports.upload = async function ({ functionName, args: files, bucket, retries = 0 }) {
  bucket = bucket || (await getBucketFromLambda(functionName))

  const dest = files.pop()

  clearLineLog('Compressing local files...')

  const stream = strippedTarStream({ gzip: true }, files)

  const key = randomTgzName()

  const upload = new S3().upload({ Bucket: bucket, Key: key, Body: stream })

  let loaded = 0
  let total

  upload.on('httpUploadProgress', ({ loaded: eventLoaded, total: eventTotal }) => {
    loaded = Math.max(loaded, eventLoaded)
    if (total == null) {
      total = eventTotal
    }
    clearLineLog(
      `Uploaded ${prettySize(loaded)} of ${total == null ? '???' : prettySize(total)}...`
    )
  })

  await upload.promise()
  clearLineLog('Invoking Lambda to copy files remotely...')

  try {
    await invokeLambda(functionName, 'upload', { bucket, key, dest })
  } catch (e) {
    // XXX: need to figure out why this is happening
    if (e.message === 'zlib: unexpected end of file') {
      if (retries >= MAX_RETRIES) {
        throw new Error('Reached max number of retries, tarball was corrupted, please try again')
      }
      clearLineLog('Corrupt tarball, trying again...')
      return exports.upload({
        functionName,
        args: files.concat(dest),
        bucket,
        retries: retries + 1,
      })
    }
    throw e
  }
  clearLineLog('All files uploaded\n')
}

/**
 * @param {{ functionName: string, args: string[], bucket?: string }} files
 */
exports.download = async function ({ functionName, args: files, bucket: configBucket }) {
  const dest = files.pop()

  clearLineLog('Invoking Lambda to package remote files...')
  const { bucket, key } = await invokeLambda(functionName, 'download', {
    bucket: configBucket,
    files,
  })

  clearLineLog('Downloading from S3...')

  const srcStream = new S3().getObject({ Bucket: bucket, Key: key }).createReadStream()
  const destStream = tar.extract({ cwd: dest })

  srcStream.on('end', () => clearLineLog('Unpacking locally...'))

  await pipePromise(srcStream, destStream)

  clearLineLog('All files downloaded and unpacked\n')
}

/**
 * @param {string} functionName
 * @param {string} action
 * @param {object} [options]
 */
async function invokeLambda(functionName, action, options) {
  const lambda = new Lambda()
  const { Payload, FunctionError } = await lambda
    .invoke({
      FunctionName: functionName,
      Payload: JSON.stringify({ action, options }),
    })
    .promise()

  if (!Payload) {
    if (FunctionError) {
      throw new Error('Unknown error occurred calling Lambda: ' + FunctionError)
    }
    return Payload
  }

  const response = JSON.parse(Payload.toString())

  if (FunctionError) {
    const err = new Error(response.errorMessage)
    err.name = response.errorType
    err.stack = (response.trace || []).join('\n')
    throw err
  }

  return response
}

/**
 * @param {string} functionName
 * @returns {Promise<string>}
 */
async function getBucketFromLambda(functionName) {
  clearLineLog('Getting S3 bucket name from Lambda...')
  const { bucket } = await invokeLambda(functionName, 'info')
  if (!bucket) {
    throw new Error(
      'Could not determine S3 bucket to use. Please specify --bucket or use the CMDA_BUCKET env '
    )
  }
  return bucket
}

const UNITS = ['B', 'kB', 'MB', 'GB']

function prettySize(bytes) {
  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), UNITS.length - 1)
  return `${(bytes / 1000 ** exponent).toPrecision(3)} ${UNITS[exponent]}`
}

function clearLineLog(msg) {
  if (process.stdout.isTTY && !process.env.NO_COLOR) {
    process.stdout.write('\u001B[2K\u001B[G')
  }
  process.stdout.write(msg)
}

exports.clearLineLog = clearLineLog
