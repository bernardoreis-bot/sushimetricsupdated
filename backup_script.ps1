$repoPath = "d:\berna\OneDrive\Documentos\GitHub\sushimetricsupdated"
Set-Location -Path $repoPath

# Add all changes
git add .

# Check if there are changes to commit
$status = git status --porcelain
if ($status) {
    # Create commit with timestamp
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $commitMessage = "Hourly backup: $timestamp"

    # Commit changes
    git commit -m $commitMessage

    # Push to remote
    git push origin main

    # Log the backup
    Add-Content -Path "$repoPath\backup_log.txt" -Value "Backup completed at $timestamp"
    Write-Host "Backup completed at $timestamp"
} else {
    Write-Host "No changes to commit"
}
