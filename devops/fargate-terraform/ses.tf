#####
# SES - Sandbox setup w/o integrated Route53
# (Note; must check state files for 3 dkim records to place into external DNS (see below: aws_route53_record))
# - or From the Loaded identities table, select the domain.
# - - On the Authentication tab of the identity details page, expand Publish DNS records. Download CSV.

resource "aws_ses_configuration_set" "ses_config" {
  name                       = "${var.prefix}-ses-config"
  reputation_metrics_enabled = true
}

resource "aws_ses_domain_identity" "domain_identity" {
  domain = var.ses_domain
}

resource "aws_ses_email_identity" "email_identity" {
  email = var.ses_from
}

resource "aws_ses_email_identity" "email_identity_prevalidate" {
  for_each = var.ses_prevalidate
  email    = each.value
}

resource "aws_ses_domain_dkim" "dkim_identity" {
  domain = aws_ses_domain_identity.domain_identity.domain
}

#resource "aws_route53_record" "amazonses_dkim_record" {
#  count   = 3
#  zone_id = aws_route53_zone.route_53_zone.zone_id
#  name    = "${aws_ses_domain_dkim.dkim_identity.dkim_tokens[count.index]}._domainkey.${aws_ses_domain_identity.domain_identity.domain}"
#  type    = "CNAME"
#  ttl     = "300"
#  records = ["${aws_ses_domain_dkim.dkim_identity.dkim_tokens[count.index]}.dkim.amazonses.com"]
#}

# resource "aws_ses_domain_identity_verification" "domain_identity_verification" {
#   domain = aws_ses_domain_identity.domain_identity.id
#   depends_on = [aws_route53_record.amazonses_dkim_record]
# }

# resource "aws_route53_zone" "route_53_zone" {
#   name = var.ses_domain
# }
