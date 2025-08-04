######
# ECR and image lifecycle policy

resource "aws_ecr_repository" "ecr" {
  name = "${var.prefix}-repo"
}

resource "aws_ecr_lifecycle_policy" "ecr_policy" {
  repository = aws_ecr_repository.ecr.name
  policy     = local.ecr_policy
}

# Note: Determine a retention policy for your business; default: keep last 100
# Also if we push 100 stage images before release we delete the production image (maybe not-tagged?)
locals {
  ecr_policy = jsonencode({
    "rules" : [
      {
        "rulePriority" : 1,
        "description" : "Expire images older than 100 pushes ago",
        "selection" : {
          "tagStatus" : "any",
          "countType" : "imageCountMoreThan",
          "countNumber" : 100
        },
        "action" : {
          "type" : "expire"
        }
      }
    ]
  })
}
