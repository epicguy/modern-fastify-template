#####
# EC2 (bastion on public)
# Note: With manually created DB, add bastion_sg to inbound rule on the DB's sg

#data "aws_ami" "amazon-linux-2" {
#  most_recent = true
#  filter {
#    name   = "owner-alias"
#    values = ["amazon"]
#  }
#  filter {
#    name = "name"
#    #values = ["al2023-ami-ecs-hvm-2023.0.20240905-kernel-6.1-arm64"]
#    values = ["al2023-ami-minimal-2023.5.20240903.0-kernel-6.1-arm64"]
#  }
#}

resource "aws_instance" "bastion" {
  ami                         = "ami-01cffeabe507bc5d8" # data.aws_ami.amazon-linux-2.id
  associate_public_ip_address = true
  instance_type               = "t4g.nano"
  key_name                    = var.bastion_ssh_key_name
  vpc_security_group_ids      = [aws_security_group.bastion_sg.id]
  subnet_id                   = aws_subnet.public_subnet_1.id
  root_block_device {
    volume_size = 8
  }
  tags = {
    Name = "${var.prefix}-Bastion"
  }
}

resource "aws_eip" "bastion" {
  domain   = "vpc"
  instance = aws_instance.bastion.id
  tags = {
    Name = "${var.prefix}-eip-bastion"
  }

}
