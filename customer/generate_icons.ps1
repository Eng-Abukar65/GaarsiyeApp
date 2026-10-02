Add-Type -AssemblyName System.Drawing

function Create-Icon {
    param([int]$size, [string]$path)
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 60, 120))
    $g.FillEllipse($brush, 0, 0, $size-1, $size-1)
    $font = New-Object System.Drawing.Font("Arial", ($size * 0.5), [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("G", $font, $textBrush, ($size/2), ($size/2), $format)
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created: $path"
}

$base = "c:\xampp\htdocs\gaarsisapp\customer\android\app\src\main\res"

Create-Icon -size 48  -path "$base\mipmap-mdpi\ic_launcher.png"
Create-Icon -size 72  -path "$base\mipmap-hdpi\ic_launcher.png"
Create-Icon -size 96  -path "$base\mipmap-xhdpi\ic_launcher.png"
Create-Icon -size 144 -path "$base\mipmap-xxhdpi\ic_launcher.png"
Create-Icon -size 192 -path "$base\mipmap-xxxhdpi\ic_launcher.png"

Copy-Item "$base\mipmap-mdpi\ic_launcher.png"     "$base\mipmap-mdpi\ic_launcher_round.png"
Copy-Item "$base\mipmap-hdpi\ic_launcher.png"     "$base\mipmap-hdpi\ic_launcher_round.png"
Copy-Item "$base\mipmap-xhdpi\ic_launcher.png"    "$base\mipmap-xhdpi\ic_launcher_round.png"
Copy-Item "$base\mipmap-xxhdpi\ic_launcher.png"   "$base\mipmap-xxhdpi\ic_launcher_round.png"
Copy-Item "$base\mipmap-xxxhdpi\ic_launcher.png"  "$base\mipmap-xxxhdpi\ic_launcher_round.png"

Write-Host "All icons created successfully!"
