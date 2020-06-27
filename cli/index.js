// @ts-check

const minimist = require('minimist')
const AWS = require('aws-sdk/global')
const { cachedProviderChain, getProfileFromIniFiles } = require('./aws')
const { info, exec, upload, download, createVpcEndpoint, clearLineLog } = require('./actions')
const { version } = require('../package.json')

const EXEC_SHORTCUTS = new Set(['cp', 'mv', 'rm', 'mkdir', 'ls', 'cat', 'touch', 'sh'])
const ALL_CMDS = new Set([
  'info',
  'exec',
  'ul',
  'upload',
  'dl',
  'download',
  'create-vpc-endpoint',
  ...EXEC_SHORTCUTS,
])

/** @type {{ action: string, functionName: string, args: string[], bucket?: string, verbose?: boolean }} */
let config

run().catch(errorAndExit)

async function run() {
  config = getConfig(process.argv.slice(2))
  switch (config.action) {
    case 'help':
      return logHelp()
    case 'info':
      return await info(config)
    case 'exec':
      return await exec(config)
    case 'ul':
    case 'upload':
      return await upload(config)
    case 'dl':
    case 'download':
      return await download(config)
    case 'create-vpc-endpoint':
      return createVpcEndpoint(config)
    default:
      throw new Error(`Unknown action: ${config.action}`)
  }
}

function logHelp() {
  console.log(`
Usage: cmda [--profile <profile>] [--function <fn>] [--bucket <bucket>] <cmd> [cmd options]

A command line tool for executing commands on, and copying files to/from AWS Lambda

Options:
--profile <profile>  AWS profile to use (default: AWS_PROFILE env or 'default')
--function <fn>      Lambda function name (default: CMDA_FUNCTION env or cmda_function from AWS CLI config)
--bucket <bucket>    S3 bucket to use for transfers (optional, will determine from Lambda if not given)
--verbose            More verbose output, especially for errors
--help               Display this help message
--version            Display command line version

Commands:
info                            Info about the cmda Lambda function and configured S3 bucket
exec <cmd> <opts>               Execute <cmd> <options> remotely on Lambda, eg 'exec ls -la'
cp|mv|rm|mkdir|ls|cat|touch|sh  Shortcuts for 'exec <cmd>'
upload <file1, ...> <dest>      Upload local files to <dest> on the Lambda filesystem (shortcut: ul)
download <file1, ...> <dest>    Download files from the Lambda filesystem to local <dest> (shortcut: dl)
create-vpc-endpoint             Creates a VPC endpoint to give the cmda Lambda function access to S3

Report bugs at github.com/lambci/cmda/issues
`)
}

/**
 * @param {string[]} cmdlineArgs
 */
function getConfig(cmdlineArgs) {
  const { CMDA_FUNCTION, CMDA_BUCKET, AWS_PROFILE } = process.env

  let actionIx = 0
  for (const arg of cmdlineArgs) {
    if (ALL_CMDS.has(arg)) {
      break
    }
    actionIx++
  }

  const cmdlineFlags = minimist(cmdlineArgs.slice(0, actionIx), {
    boolean: ['version', 'help', 'verbose'],
    alias: { function: 'function-name' },
    default: { profile: AWS_PROFILE || 'default', function: CMDA_FUNCTION, bucket: CMDA_BUCKET },
  })

  let [action, ...args] = cmdlineArgs.slice(actionIx)

  if (cmdlineFlags.version) {
    console.log(version)
    process.exit()
  }

  if (cmdlineFlags.help || action == null || action === 'help') {
    return { action: 'help', args: [], functionName: '' }
  }

  if (EXEC_SHORTCUTS.has(action)) {
    args.unshift(action)
    action = 'exec'
  }

  let { function: functionName, bucket, profile, verbose } = cmdlineFlags

  process.env.AWS_SDK_LOAD_CONFIG = '1'
  if (profile) {
    process.env.AWS_PROFILE = profile
  }

  AWS.config = new AWS.Config({
    httpOptions: { timeout: 15 * 60 * 1000 },
    credentialProvider: cachedProviderChain,
  })

  if (!functionName || !bucket) {
    const iniProfile = getProfileFromIniFiles(profile)
    functionName = functionName || iniProfile.cmda_function
    bucket = bucket || iniProfile.cmda_bucket
  }
  if (!functionName) {
    throw new Error('Unknown Lambda function. Please specify --function or CMDA_FUNCTION env')
  }
  return {
    action,
    args,
    functionName,
    bucket,
    verbose,
  }
}

/**
 * @param {Error & {code: string}} err
 */
function errorAndExit({ name, code, message, stack }) {
  clearLineLog('')
  if (code === 'CredentialsError') {
    console.error(
      'Could not find valid AWS credentials. Try running the AWS CLI to refresh credentials and then try again:'
    )
    console.error()
    console.error(
      `aws ${
        process.env.AWS_PROFILE ? `--profile ${process.env.AWS_PROFILE}` : ''
      } sts get-caller-identity`
    )
  } else if (name === 'TimeoutError') {
    console.error(
      'Timeout error trying to access S3. Your cmda Lambda function may be in a VPC that does not have access to S3.'
    )
    console.error('You can try to fix this by running:')
    console.error()
    console.error('cmda create-vpc-endpoint')
    console.error()
    console.error('Otherwise, see the AWS documentation for more information:')
    console.error(
      'https://docs.aws.amazon.com/vpc/latest/userguide/vpce-gateway.html#create-gateway-endpoint'
    )
  } else {
    if (config && config.verbose) {
      console.error({ name, code, message })
      console.error(stack)
    } else {
      console.error(message)
    }
  }
  process.exit(1)
}
