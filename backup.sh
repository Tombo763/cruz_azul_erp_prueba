#!/bin/bash
source /srv/cruz_azul-erp/.env
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="backup_cruz_azul_$TIMESTAMP.sql"
LOCAL_BACKUP_PATH="/tmp/$BACKUP_NAME"

export PGPASSWORD=$DB_PASSWORD
pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -p "$DB_PORT" > "$LOCAL_BACKUP_PATH"

if [ $? -eq 0 ]; then
    # Aquí aplicamos el parámetro '--acl' porque las habilitamos al crear el bucket
    aws s3 cp "$LOCAL_BACKUP_PATH" "s3://$AWS_S3_BUCKET/$BACKUP_NAME" --acl bucket-owner-full-control
    rm -f "$LOCAL_BACKUP_PATH"
fi