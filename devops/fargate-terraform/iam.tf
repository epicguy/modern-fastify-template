#####
# IAM for ECS-Task-roles (task, execution)
# - Also reference a user for Cloudfront S3 updates via Github-actions

resource "aws_iam_role" "ecs_execution" {
  name               = "${var.prefix}-app-ecsTaskExecutionRole"
  assume_role_policy = data.aws_iam_policy_document.assume_ecs_tasks.json
}

data "aws_iam_policy_document" "assume_ecs_tasks" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}
resource "aws_iam_role_policy_attachment" "ecs_role_to_ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = data.aws_iam_policy.ecs_role.arn
}

resource "aws_iam_role_policy_attachment" "ssm_to_ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = data.aws_iam_policy.ssm.arn
}

data "aws_iam_policy" "ecs_role" {
  arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
data "aws_iam_policy" "ssm" {
  arn = "arn:aws:iam::${var.aws_account}:policy/ssm-paramater-store-fargate"
}

# TODO
# There is an extra manual step to keep secrets from terraform state
# Manually create user github-actions-fe (group) and new API key (CLI, "push s3 invalidate cf")
#  and place API key into front-end github repo actions secrets
#
data "aws_iam_user" "github-actions-fe" {
  user_name = "github-actions-fe"
}
resource "aws_iam_user_policy_attachment" "cf_invalidate_to_github-actions-fe" {
  for_each = var.deployment_environments

  user       = data.aws_iam_user.github-actions-fe.user_name
  policy_arn = aws_iam_policy.cf_invalidate[each.key].arn
}

resource "aws_iam_policy" "cf_invalidate" {
  for_each = var.deployment_environments

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "CFInvalidate"
        Effect   = "Allow"
        Action   = "cloudfront:CreateInvalidation"
        Resource = aws_cloudfront_distribution.cf[each.key].arn
      }
    ]
  })
}

# TODO
# There is an extra manual step to keep secrets from terraform state
# Manually create user ses-send (group) and new API key (CLI, "ses send from API")
#  and place API key into back-end secrets
#
data "aws_iam_user" "ses_send" {
  user_name = "ses-send"
}
resource "aws_iam_user_policy_attachment" "ses_send" {
  user       = data.aws_iam_user.ses_send.user_name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSESFullAccess"
}

# TODO
# There is an extra manual step to keep secrets from terraform state
# Manually create users (__TEMPLATE_PROJ_TAG__-api-user-stage and -prod) and new API key
# (CLI, "API operations for {env}") and place API key into back-end secrets
#
data "aws_iam_user" "api_user" {
  for_each  = var.deployment_environments
  user_name = "${var.prefix}-api-user-${each.key}"
}

resource "aws_iam_policy" "api_user" {
  for_each = var.deployment_environments

  name = "${var.prefix}-api-user-${each.key}"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowS3Uploads"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "arn:aws:s3:::${var.prefix}-s3-${each.key}-uploads/avatars/*"
        ]
      },
      {
        Sid    = "AllowSESSend"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "api_user" {
  for_each = var.deployment_environments

  user       = data.aws_iam_user.api_user[each.key].user_name
  policy_arn = aws_iam_policy.api_user[each.key].arn
}
