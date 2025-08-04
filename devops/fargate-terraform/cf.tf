#####
# CloudFront for the web stuff
# Uses separate s3-bucket/distributions for each deploy environment

resource "aws_cloudfront_distribution" "cf" {
  for_each = var.deployment_environments

  enabled = true
  origin {
    domain_name = aws_s3_bucket.cf[each.key].bucket_regional_domain_name
    origin_id   = "${aws_s3_bucket.cf[each.key].bucket}-origin"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "match-viewer"
      origin_ssl_protocols   = ["TLSv1", "TLSv1.1", "TLSv1.2"]
    }
  }
  default_root_object = "index.html"
  default_cache_behavior {
    target_origin_id = "${aws_s3_bucket.cf[each.key].bucket}-origin"
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    forwarded_values {
      query_string = true
      cookies { forward = "all" }
    }
    viewer_protocol_policy     = "redirect-to-https"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.cf.id
    min_ttl                    = 0
    default_ttl                = 3600
    max_ttl                    = 86400
  }
  price_class = "PriceClass_100"
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  aliases = [each.value.web_domain]
  viewer_certificate {
    cloudfront_default_certificate = false
    ssl_support_method             = "sni-only"
    acm_certificate_arn            = var.certificate_arn
  }
}

resource "aws_cloudfront_response_headers_policy" "cf" {
  name = "security-headers-policy"
  security_headers_config {
    strict_transport_security {
      override                   = true
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = true
    }
  }
}

# If there is a 404, return index.html with a HTTP 200 Response
#custom_error_response {
#    error_caching_min_ttl = 3000
#    error_code = 404
#    response_code = 200
#    response_page_path = "/index.html"
#}
