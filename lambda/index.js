// @ts-check

const { spawnSync } = require('child_process')
const tar = require('tar')
const S3 = require('aws-sdk/clients/s3')
const { randomTgzName, strippedTarStream, pipePromise } = require('../shared/tar')
const { version } = require('./package.json')

const { CMDA_BUCKET } = process.env

const s3 = new S3()
;(s3.config.httpOptions || {}).timeout = 15 * 60 * 1000

/**
 * @param {{ action: string, options: any }} event
 */
exports.handler = async ({ action, options }) => {
  switch (action) {
    case 'info':
      return actionInfo()
    case 'exec':
      return actionExec(options)
    case 'upload':
      return actionUpload(options)
    case 'download':
      return actionDownload(options)
    default:
      throw new Error(`Unknown action: ${action}`)
  }
}

async function actionInfo() {
  return {
    functionVersion: version,
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    bucket: CMDA_BUCKET,
  }
}

/**
 * @param {{ cmd: string, args: string[] }} options
 */
async function actionExec({ cmd, args = [] }) {
  if (!cmd) throw new Error('cmd cannot be empty')

  /** @type {{ status: number?, stderr: Buffer, stdout: Buffer, error?: NodeJS.ErrnoException }} */
  const { status, stderr, stdout, error } = spawnSync(cmd, args, { encoding: 'buffer' })

  return {
    status,
    stdout: stdout && stdout.toString('base64'),
    stderr: stderr && stderr.toString('base64'),
    error: error && {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
  }
}

/**
 * @param {{ bucket?: string, key: string, dest: string }} options
 */
async function actionUpload({ bucket = CMDA_BUCKET, key, dest }) {
  if (!bucket) throw new Error('bucket cannot be empty')
  if (!key) throw new Error('key cannot be empty')
  if (!dest) throw new Error('dest cannot be empty')

  await checkBucketAccess({ bucket })

  return pipePromise(
    s3.getObject({ Bucket: bucket, Key: key }).createReadStream(),
    tar.extract({
      cwd: dest,
      onentry: (entry) => console.dir({ path: entry.path, size: entry.size }),
    })
  )
}

/**
 * @param {{ bucket?: string, files: string[] }} options
 */
async function actionDownload({ bucket = CMDA_BUCKET, files }) {
  if (!bucket) throw new Error('bucket cannot be empty')
  if (!files || !files.length) throw new Error('files cannot be empty')

  await checkBucketAccess({ bucket })

  const key = randomTgzName()

  const stream = strippedTarStream({ gzip: true }, files)

  const upload = s3.upload({ Bucket: bucket, Key: key, Body: stream })

  await upload.promise()

  return { bucket, key }
}

/**
 * @param {{ bucket?: string }} options
 */
async function checkBucketAccess({ bucket = CMDA_BUCKET }) {
  if (!bucket) throw new Error('bucket cannot be empty')
  const s3 = new S3()
  s3.config.maxRetries = 0
  const httpOptions = s3.config.httpOptions || {}
  httpOptions.timeout = 2000
  httpOptions.connectTimeout = 2000
  await s3.headBucket({ Bucket: bucket }).promise()
}
