# GitHub actions info

## AWS Credentials

#### Create a non-console user in AWS

#### Attach a policy to this user

In AWS IAM we called this "policy" `GithubActions_ECS_ECR`

```
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Action": [
				"ecr:InitiateLayerUpload",
				"ecr:UploadLayerPart",
				"ecr:CompleteLayerUpload",
				"ecr:BatchCheckLayerAvailability",
				"ecr:PutImage",
				"ecr:BatchGetImage",
				"iam:PassRole"
			],
			"Resource": "arn:aws:ecr:us-east-1:AWS_ACCOUNT:repository/prefix-repo",
			"Effect": "Allow"
		},
		{
			"Action": [
				"iam:PassRole"
			],
			"Resource": "arn:aws:iam::AWS_ACCOUNT:role/prefix-app-ecsTaskExecutionRole",
			"Effect": "Allow"
		},
		{
			"Action": [
				"ecs:DescribeTaskDefinition",
				"ecs:DescribeServices",
				"ecs:UpdateServicePrimaryTaskSet",
				"ecr:GetAuthorizationToken",
				"ecs:RegisterTaskDefinition",
				"ecs:UpdateService"
			],
			"Resource": "*",
			"Effect": "Allow"
		}
	]
}
```

#### Generate keys for the GitHub Repo

#### Update repo settings
