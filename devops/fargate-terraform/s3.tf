#####
# S3 (cf=cloudfront for the web stuff)

resource "aws_s3_bucket" "cf" {
  for_each = var.deployment_environments
  bucket   = "${var.prefix}-s3-${each.key}-cf"
}

resource "aws_s3_bucket_ownership_controls" "cf" {
  for_each = aws_s3_bucket.cf
  bucket   = each.value.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "cf" {
  for_each   = aws_s3_bucket.cf
  depends_on = [aws_s3_bucket_ownership_controls.cf]
  bucket     = each.value.id
  acl        = "public-read"
}

resource "aws_s3_bucket_public_access_block" "cf" {
  for_each = aws_s3_bucket.cf
  bucket   = each.value.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_website_configuration" "cf" {
  for_each = aws_s3_bucket.cf
  bucket   = each.value.id

  index_document { suffix = "index.html" }
  error_document { key = "index.html" }
}

resource "aws_s3_bucket_policy" "cf" {
  for_each   = aws_s3_bucket.cf
  depends_on = [data.aws_iam_user.github-actions-fe]
  bucket     = each.value.id

  policy = jsonencode({
    Version = "2012-10-17"
    #Id      = "AllowGetObjects"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${each.value.arn}/*"
        }, {
        Sid    = "GithubActionsDeploy"
        Effect = "Allow"
        Principal = {
          "AWS" = "${data.aws_iam_user.github-actions-fe.arn}"
        }
        Action   = "s3:*"
        Resource = ["${each.value.arn}", "${each.value.arn}/*"]
      }
    ]
  })
}

#####
# S3 for user uploads (avatars, etc.)

resource "aws_s3_bucket" "uploads" {
  for_each = var.deployment_environments
  bucket   = "${var.prefix}-s3-${each.key}-uploads"
  tags = {
    Application = "__TEMPLATE_PROJ_NAME__ Fargate - Terraform"
    Environment = each.key
  }
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  for_each = aws_s3_bucket.uploads

  bucket = each.value.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  for_each = aws_s3_bucket.uploads
  bucket   = each.value.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "uploads" {
  for_each = aws_s3_bucket.uploads
  bucket   = each.value.id

  depends_on = [aws_s3_bucket_public_access_block.uploads]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowPublicRead"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${each.value.arn}/avatars/*"
      },
      {
        Sid       = "RequireSignedUrlUploads"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${each.value.arn}/avatars/*"
      }
    ]
  })
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  for_each = aws_s3_bucket.uploads
  bucket   = each.value.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT"]
    allowed_origins = ["https://${var.deployment_environments[each.key].web_domain}"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

#####
# Local development S3 bucket for avatar uploads

resource "aws_s3_bucket" "local_uploads" {
  bucket = "__TEMPLATE_PROJ_TAG__-s3-local-uploads"
  tags = {
    Application = "__TEMPLATE_PROJ_NAME__ Fargate - Terraform"
    Environment = "local"
  }
}

resource "aws_s3_bucket_ownership_controls" "local_uploads" {
  bucket = aws_s3_bucket.local_uploads.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_public_access_block" "local_uploads" {
  bucket = aws_s3_bucket.local_uploads.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "local_uploads" {
  bucket = aws_s3_bucket.local_uploads.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSignedUrlUploads"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.local_uploads.arn}/avatars/*"
      },
      {
        Sid       = "AllowPublicRead"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.local_uploads.arn}/avatars/*"
      }
    ]
  })
}

resource "aws_s3_bucket_cors_configuration" "local_uploads" {
  bucket = aws_s3_bucket.local_uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT"]
    allowed_origins = ["http://localhost:3000"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
