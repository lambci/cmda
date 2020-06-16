# cmda

A Lambda stack and S3 bucket to support the [`cmda` command line tool](https://github.com/lambci/cmda).

This tool allows you to execute remote commands, including uploading local files/directories,
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

# Installation

## Lambda function (this application)

You can optionally enter VPC details (like a security group and subnets) to have the function launch in an existing VPC when you create the application.

You can also add EFS filesystem details if you want to copy to/from EFS – just enter the EFS Access Point ID
(you can find this from "Manage client access" on your filesystem in the EFS web console, eg `fsap-1234abcd`) and
local mount path you want (eg `/mnt/efs`) in the given prompts.

![cmda setup](https://lambci.s3.amazonaws.com/assets/cmda_sar_config.png)

After the application has been deployed, you'll need the name of the Lambda function it created, to configure `cmda`.
You can get this by clicking on the `CmdaFunction` Resource in the Resources list, or by looking at the CloudFormation Stack's outputs for `FunctionName`.

It will look something like: `serverlessrepo-cmda-CmdaFunction-12Q3L4R5I6O76`

## CLI tool

See the [`cmda` repository](https://github.com/lambci/cmda) for how to install and use the CLI tool.
