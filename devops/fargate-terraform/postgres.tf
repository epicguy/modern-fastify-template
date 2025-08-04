resource "aws_db_instance" "postgres_1" {
  apply_immediately    = true # Change as needed for a given run
  identifier           = "${var.prefix}-postgres-db"
  instance_class       = "db.t3.micro"
  engine               = "postgres"
  engine_version       = "16.3"
  license_model        = "postgresql-license"
  allocated_storage    = 20
  storage_encrypted    = true
  storage_type         = "gp2"
  iops                 = 0
  deletion_protection  = false # True later, after things settle.
  port                 = 5432
  parameter_group_name = aws_db_parameter_group.postgres_paramater_group_1.name

  network_type           = "IPV4"
  publicly_accessible    = false
  multi_az               = true
  db_subnet_group_name   = aws_db_subnet_group.postgres_subnet_group_1.id
  vpc_security_group_ids = [aws_security_group.postgres_sg.id]

  username = "aws_root"
  db_name  = var.prefix
  password = "CHANGE_LATER" # sensitive

  maintenance_window                    = "tue:08:09-tue:08:39"
  auto_minor_version_upgrade            = true
  backup_target                         = "region"
  backup_window                         = "10:17-10:47"
  backup_retention_period               = 7
  delete_automated_backups              = true
  skip_final_snapshot                   = true
  copy_tags_to_snapshot                 = true
  monitoring_interval                   = 60
  monitoring_role_arn                   = aws_iam_role.postgres_monitor_role_1.arn
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"] # ["audit", "error", "general", "slowquery"]
}

resource "aws_iam_role" "postgres_monitor_role_1" {
  name                 = "${var.prefix}-rds-monitoring-role"
  max_session_duration = 3600
  path                 = "/"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Sid       = ""
    }]
  })
}

#
# To use the old entry in the role above:
#   managed_policy_arns  = ["arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"]
# Instead you use 'data' to reference this existing policy in AWS, then attach it to the role above
#
resource "aws_iam_role_policy_attachment" "rds_to_pgm_1" {
  role       = aws_iam_role.postgres_monitor_role_1.name
  policy_arn = data.aws_iam_policy.rds_monitor_role.arn
}

data "aws_iam_policy" "rds_monitor_role" {
  arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}



# For lifecycle management, include a custom paramater-group for later editing if needed
resource "aws_db_parameter_group" "postgres_paramater_group_1" {
  name   = "postgres-1"
  family = "postgres16"
}

resource "aws_db_subnet_group" "postgres_subnet_group_1" {
  name        = "${var.prefix}-db-subnet"
  description = "Private subnets"
  subnet_ids  = [aws_subnet.private_subnet_1.id, aws_subnet.private_subnet_2.id, aws_subnet.private_subnet_3.id]
}
