#!/bin/bash
# Creates (idempotently) the Bistro EC2 host with the AWS CLI's configured account/region:
# key pair, security group, t4g.small Ubuntu 24.04 arm64 instance, Elastic IP.
# Writes non-secret facts to deploy/state/ (gitignored). The SSH key goes to ~/.ssh.
set -euo pipefail
NAME=bistro-api
TYPE=t4g.small
KEY=bistro-key
KEY_PATH="$HOME/.ssh/$KEY.pem"
STATE="$(dirname "$0")/state"
mkdir -p "$STATE"

MY_IP=$(curl -s https://checkip.amazonaws.com)
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text)

if ! aws ec2 describe-key-pairs --key-names "$KEY" >/dev/null 2>&1; then
  aws ec2 create-key-pair --key-name "$KEY" --key-type ed25519 --query KeyMaterial --output text > "$KEY_PATH"
  chmod 400 "$KEY_PATH"
fi

SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values="$NAME-sg" Name=vpc-id,Values="$VPC" --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG" = "None" ]; then
  SG=$(aws ec2 create-security-group --group-name "$NAME-sg" --description "Bistro API: SSH from operator, HTTP/HTTPS public" --vpc-id "$VPC" --query GroupId --output text)
  aws ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions \
    "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]" \
    "IpProtocol=udp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]" \
    "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=ACME+redirect}],Ipv6Ranges=[{CidrIpv6=::/0}]" >/dev/null
fi
# SSH only from the operator's current address (re-run to update after an IP change).
aws ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 22 --cidr "$MY_IP/32" >/dev/null 2>&1 || true

INSTANCE=$(aws ec2 describe-instances --filters Name=tag:Name,Values="$NAME" Name=instance-state-name,Values=pending,running,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ "$INSTANCE" = "None" ]; then
  INSTANCE=$(aws ec2 run-instances --image-id "$AMI" --instance-type "$TYPE" --key-name "$KEY" \
    --security-group-ids "$SG" \
    --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}' \
    --metadata-options 'HttpTokens=required,HttpEndpoint=enabled,HttpPutResponseHopLimit=1' \
    --credit-specification CpuCredits=standard \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=app,Value=bistro}]" \
      "ResourceType=volume,Tags=[{Key=Name,Value=$NAME-root},{Key=app,Value=bistro}]" \
    --query 'Instances[0].InstanceId' --output text)
fi
aws ec2 wait instance-running --instance-ids "$INSTANCE"

ALLOC=$(aws ec2 describe-addresses --filters Name=tag:Name,Values="$NAME-eip" --query 'Addresses[0].AllocationId' --output text)
if [ "$ALLOC" = "None" ]; then
  ALLOC=$(aws ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME-eip},{Key=app,Value=bistro}]" --query AllocationId --output text)
fi
aws ec2 associate-address --instance-id "$INSTANCE" --allocation-id "$ALLOC" >/dev/null
IP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)

echo "$INSTANCE" > "$STATE/instance-id"
echo "$IP" > "$STATE/ip"
echo "$(echo "$IP" | tr . -).sslip.io" > "$STATE/domain"
echo "instance=$INSTANCE ip=$IP sg=$SG domain=$(cat "$STATE/domain")"
