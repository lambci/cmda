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

/**
 * @param {{ functionName: string, args: string[], bucket?: string }} options
 */
exports.upload = async function ({ functionName, args: files, bucket }) {
  bucket = bucket || (await getBucketFromLambda(functionName))

  const dest = files.pop()

  const stream = strippedTarStream({ gzip: true }, files)

  const key = randomTgzName()

  const upload = new S3().upload({ Bucket: bucket, Key: key, Body: stream })
  upload.on('httpUploadProgress', console.log)

  const data = await upload.promise()
  console.log(data)

  const payload = await invokeLambda(functionName, 'upload', { bucket, key, dest })
  console.log(payload)
}

/**
 * @param {{ functionName: string, args: string[], bucket?: string }} files
 */
exports.download = async function ({ functionName, args: files, bucket: configBucket }) {
  const dest = files.pop()

  const { bucket, key } = await invokeLambda(functionName, 'download', {
    bucket: configBucket,
    files,
  })

  const srcStream = new S3().getObject({ Bucket: bucket, Key: key }).createReadStream()
  const destStream = tar.extract({ cwd: dest })

  await pipePromise(srcStream, destStream)
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
  const { bucket } = await invokeLambda(functionName, 'info')
  if (!bucket) {
    throw new Error(
      'Could not determine S3 bucket to use. Please specify --bucket or use the CMDA_BUCKET env '
    )
  }
  return bucket
}
