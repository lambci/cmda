# cmda

A Lambda function to support the [`cmda` command line tool](https://github.com/lambci/cmda).

This tool allows you to execute remote commands, including file copying,
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

## Lambda function (this application)

You can optionally enter VPC details (like a security group and subnets) to have the function launch in an existing VPC when you create the application.

After the application has been deployed, you'll need the full name of the Lambda function it created, to configure `cmda`.
You can get this by clicking on the `CmdaFunction` Resource in the Resources list, or by looking at the CloudFormation Stack's outputs where it's called `FunctionName`.

It will look something like: `serverlessrepo-cmda-CmdaFunction-12Q3L4R5I6O76`

## CLI tool

See the [`cmda` repository](https://github.com/lambci/cmda) for how to install and use the CLI tool.
