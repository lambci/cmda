# cmda

`cmda` (think: commander) is a CLI tool that can execute remote commands, including file copying,
on an [AWS Lambda](https://aws.amazon.com/lambda/) function.

For example, here's how to copy local files to/from a Lambda instance:

```console
$ cmda mkdir /tmp/somedir

$ cmda upload ./mylocalfile.txt /tmp/somedir/

$ cmda ls -l /tmp/somedir
total 12
-rw-r--r-- 1 sbx_user1051 495 10454 Jun 11 18:40 mylocalfile.txt

$ cmda exec bash -c 'echo hello > /tmp/someremotefile.txt'

$ cmda download /tmp/someremotefile.txt ./
```

# Installation

You'll need [Node.js](https://nodejs.org/en/download/) installed, and then you can either install `cmda` globally:

```console
npm install -g cmda
cmda [args...]
```

Or you can use `npx` (which comes with Node.js) to run it each time:

```console
npx cmda [args...]
```

## Lambda function

You'll also need a Lambda function that understands `cmda`'s commands. You can deploy one from the
[`cmda` application in the Serverless Application Repository](https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:553035198032:applications~cmda).

You can optionally enter VPC details (like a security group and subnets) to have the function launch in an existing VPC when you create the application.

After the application has been deployed, you'll need the full name of the Lambda function it created, to configure `cmda`.
You can get this by clicking on the `CmdaFunction` Resource in the Resources list, or by looking at the CloudFormation Stack's outputs where it's called `FunctionName`.

It will look something like: `serverlessrepo-cmda-CmdaFunction-12Q3L4R5I6O76`

# Configuration

`cmda` needs to know which function it's calling each time, which you can either do on the command line:

```console
cmda --function my-CmdaFunction-1234 info
```

Or as an environment variable:

```console
CMDA_FUNCTION=my-CmdaFunction-1234 cmda info
```

Or by saving it to your AWS config (`~/.aws/config`):

```console
aws configure set cmda_function my-CmdaFunction-1234
cmda info
```

## AWS profile

`cmda` will respect the `AWS_PROFILE` environment variable, or the `--profile` command line flag
if you want to use a non-default AWS profile.

```console
aws --profile my-profile configure set cmda_function my-CmdaFunction-1234
cmda --profile my-profile info
```

## Multi-factor auth or SSO credentials

`cmda` doesn't support multi-factor auth codes itself, but it will try to read cached AWS CLI credentials,
so if you make an API call with the AWS CLI, you should be able to subsequently use `cmda` with those credentials until they expire.

```console
$ aws --profile my-mfa-profile sts get-caller-identity
Enter MFA code for arn:aws:iam::1234:mfa/michael: ****
$ cmda --profile my-mfa-profile info
```

# Usage

```console
Usage: cmda [--profile <profile>] [--function <fn>] [--bucket <bucket>] <cmd> [cmd options]

A command line tool for executing commands on, and copying files to/from AWS Lambda

Options:
--profile <profile>  AWS profile to use (default: AWS_PROFILE env or 'default')
--function <fn>      Lambda function name (default: CMDA_FUNCTION env or cmda_function from AWS CLI config)
--bucket <bucket>    S3 bucket to use for transfers (optional, will determine from Lambda if not given)
--help               Display this help message
--version            Display command line version

Commands:
info                          Info about the cmda Lambda function and configured S3 bucket
exec <cmd> <opts>             Execute <cmd> <options> remotely on Lambda, eg 'exec ls -la'
upload <file1, ...> <dest>    Upload local files to <dest> on the Lambda filesystem (shortcut: ul)
download <file1, ...> <dest>  Download files from the Lambda filesystem to local <dest> (shortcut: dl)
cp|mv|rm|mkdir|ls|cat|touch   Shortcuts for 'exec <cmd>' above
```
