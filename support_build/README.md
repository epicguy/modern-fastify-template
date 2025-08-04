# GitHub actions info

## AWS Credentials

Notes:

- It is expected that you have used e.g. `devops/fargate-terraform` to create the repo
- Replace `AWS_ACCOUNT` with your own account number, in places below.
- Replace `prefix` with your project-tag

#### Create a non-console user in AWS

Be descriptive, e.g: github-actions or github-actions-be (if you'll be deploying a front-end separately)

#### Attach a policy to this user

In AWS IAM maybe call this "policy" `GithubActions_ECS_ECR`

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

Navigate to this user in the AWS IAM console, and choose 'Create access key.' This will result in values for these repo secrets:

- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY

#### Update repo settings

Visit `https://__TEMPLATE_REPO_PATH__/__TEMPLATE_REPO_NAME__/settings/secrets/actions`

Set these Repository Secrets:

- AWS_ACCOUNT
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- DISCORD_WEBHOOK_URL -OR- SLACK_WEBHOOK_URL
