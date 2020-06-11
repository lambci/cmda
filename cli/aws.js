// @ts-check

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const os = require('os')
const AWS = require('aws-sdk/global')
const { iniLoader } = require('aws-sdk/lib/shared-ini')

/**
 * @param {string} [profile]
 */
function getProfileFromIniFiles(profile = process.env.AWS_PROFILE || 'default') {
  return {
    ...iniLoader.loadFrom({ isConfig: true, filename: process.env.AWS_CONFIG_FILE })[profile],
    ...iniLoader.loadFrom({ filename: process.env.AWS_SHARED_CREDENTIALS_FILE })[profile],
  }
}

class CachedCliCredentials extends AWS.Credentials {
  /**
   * @param {(err?: Error) => void} callback
   */
  load(callback) {
    const profile = getProfileFromIniFiles()

    let strToHash
    if (profile.role_arn) {
      const cacheObj = {
        ...(profile.duration_seconds && { DurationSeconds: +profile.duration_seconds }),
        ...(profile.external_id && { ExternalId: profile.external_id }),
        RoleArn: profile.role_arn,
        ...(profile.role_session_name && { RoleSessionName: profile.role_session_name }),
        ...(profile.mfa_serial && { SerialNumber: profile.mfa_serial }),
      }
      // XXX: The python JSON serializer adds spaces to separators by default
      strToHash = JSON.stringify(cacheObj, null, 1).replace(/\n/g, '').replace(/^{ /, '{')
    } else if (profile.sso_account_id && profile.sso_role_name && profile.sso_start_url) {
      strToHash = JSON.stringify({
        accountId: profile.sso_account_id,
        roleName: profile.sso_role_name,
        startUrl: profile.sso_start_url,
      })
    }
    if (!strToHash) {
      return callback(new Error('No cached credentials found'))
    }

    const hash = crypto.createHash('sha1').update(strToHash).digest('hex')
    const filepath = path.join(os.homedir(), '.aws', 'cli', 'cache', hash + '.json')
    try {
      const { Credentials } = JSON.parse(fs.readFileSync(filepath, { encoding: 'utf8' })) || {}
      if (Credentials) {
        this.accessKeyId = Credentials.AccessKeyId
        this.secretAccessKey = Credentials.SecretAccessKey
        this.sessionToken = Credentials.SessionToken
        this.expireTime = new Date((Credentials.Expiration || '').replace(/UTC$/, 'Z'))
        this.expired = this.expireTime < new Date()
        return callback()
      }
    } catch (e) {}

    callback(new Error(`Could not read cached credentials from file ${filepath}`))
  }

  /**
   * @param {(err?: import('aws-sdk').AWSError) => void} callback
   */
  refresh(callback) {
    // @ts-ignore - this method exists in AWS.Credentials
    super.coalesceRefresh((err) => {
      if (!err && this.expired) {
        err = new Error('Please refresh your credentials using the AWS CLI')
      }
      callback(err)
    })
  }
}

exports.CachedCliCredentials = CachedCliCredentials
exports.getProfileFromIniFiles = getProfileFromIniFiles

const CREDENTIALS_HTTP_OPTIONS = { httpOptions: { connectTimeout: 1000 } }
const CREDENTIALS_HTTP_RETRY_OPTIONS = { maxRetries: 0, ...CREDENTIALS_HTTP_OPTIONS }

// https://github.com/aws/aws-sdk-js/blob/858041ba5264ec1c185f58a9b22beaeab8b1ec8d/lib/node_loader.js#L61-L69
exports.cachedProviderChain = new AWS.CredentialProviderChain([
  () => new AWS.EnvironmentCredentials('AWS'),
  () => new AWS.EnvironmentCredentials('AMAZON'),
  // @ts-ignore - types are wrong, options are optional
  () => new CachedCliCredentials(),
  () => new AWS.SharedIniFileCredentials(CREDENTIALS_HTTP_OPTIONS),
  // @ts-ignore - types are wrong, connectTimeout is a valid http option
  () => new AWS.ECSCredentials(CREDENTIALS_HTTP_RETRY_OPTIONS),
  () => new AWS.ProcessCredentials(CREDENTIALS_HTTP_OPTIONS),
  // @ts-ignore - types are wrong, they don't include this provider
  () => new AWS.TokenFileWebIdentityCredentials(CREDENTIALS_HTTP_RETRY_OPTIONS),
  // @ts-ignore - types are wrong, connectTimeout is a valid http option
  () => new AWS.EC2MetadataCredentials(CREDENTIALS_HTTP_RETRY_OPTIONS),
])
