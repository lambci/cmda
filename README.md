# cmda

`cmda` (think: commander) is a CLI tool that can execute remote commands, including uploading local files/directories,
to an [AWS Lambda](https://aws.amazon.com/lambda/) function. Along with [EFS for Lambda](https://docs.aws.amazon.com/lambda/latest/dg/services-efs.html),
this makes it an easy tool to move files to/from an EFS file system that you might use with your other Lambda functions.

For example, here's how to run commands and copy local files to/from a filesystem mounted at `/mnt/efs` on a Lambda instance:

```console
$ cmda upload ./mylocalfile.txt ./mylocaldir /mnt/efs/

$ cmda ls -l /mnt/efs/
total 12
drwxrwxr-x 2 sbx_user1051 495  4096 Jun 11 18:40 mylocaldir
-rw-r--r-- 1 sbx_user1051 495 10454 Jun 11 18:40 mylocalfile.txt

$ cmda sh -c 'echo hello > /mnt/efs/someremotefile.txt'

$ cmda mkdir /mnt/efs/someremotedir

$ cmda download /mnt/efs/someremotefile.txt /mnt/efs/someremotedir ./
```

`cmda` uses an S3 bucket as a staging area while it's uploading and downloading – the Lambda function and S3 bucket can be deployed easily using the installation instructions below.

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

You'll need a Lambda function that understands `cmda`'s commands. You can deploy one from the
[`cmda` application in the Serverless Application Repository](https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:553035198032:applications~cmda).

You can optionally enter VPC details (like a security group and subnets) to have the function launch in an existing VPC when you create the application.

You can also add EFS filesystem details if you want to copy to/from EFS – just enter the EFS Access Point ID
(you can find this from "Manage client access" on your filesystem in the EFS web console, eg `fsap-1234abcd`) and
local mount path you want (eg `/mnt/efs`) in the given prompts.

![cmda setup](https://lambci.s3.amazonaws.com/assets/cmda_sar_config.png)

After the application has been deployed, you'll need the name of the Lambda function it created, to configure `cmda`.
You can get this by clicking on the `CmdaFunction` Resource in the Resources list, or by looking at the CloudFormation Stack's outputs for `FunctionName`.

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
info                            Info about the cmda Lambda function and configured S3 bucket
exec <cmd> <opts>               Execute <cmd> <options> remotely on Lambda, eg 'exec ls -la'
upload <file1, ...> <dest>      Upload local files to <dest> on the Lambda filesystem (shortcut: ul)
download <file1, ...> <dest>    Download files from the Lambda filesystem to local <dest> (shortcut: dl)
cp|mv|rm|mkdir|ls|cat|touch|sh  Shortcuts for 'exec <cmd>' above
```
