param(
	[Parameter(Mandatory)] [string] $Source,
	[Parameter(Mandatory)] [string] $OutTga,
	[int] $Size = 64,
	[string] $PreviewPng
)
# Trims the transparent margin, centers the art on a square canvas, scales it with high-quality
# bicubic filtering, and writes an uncompressed 32-bit TGA (BGRA, bottom-left origin) for WoW.
# Windows PowerShell (System.Drawing). From addon/Vintage:
#   powershell -File Tools/make-icon.ps1 -Source ../../assets/brand/vintage-tag-color.png -OutTga Media/Icon.tga
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Bitmap]::new($Source)
$w = $src.Width; $h = $src.Height
$rect = [System.Drawing.Rectangle]::new(0, 0, $w, $h)
$data = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($data.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$src.UnlockBits($data)
$minX = $w; $minY = $h; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $h; $y++) {
	$row = $y * $data.Stride
	for ($x = 0; $x -lt $w; $x++) {
		if ($bytes[$row + $x * 4 + 3] -gt 8) {
			if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
			if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
		}
	}
}
$bw = $maxX - $minX + 1; $bh = $maxY - $minY + 1
$side = [Math]::Max($bw, $bh)
$pad = [int]([Math]::Round($side * 0.03))
$side += 2 * $pad
"Art bounds: x $minX-$maxX, y $minY-$maxY ($bw x $bh); square $side"

$out = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($out)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$srcX = $minX - $pad - [int](($side - 2 * $pad - $bw) / 2)
$srcY = $minY - $pad - [int](($side - 2 * $pad - $bh) / 2)
$attrs = [System.Drawing.Imaging.ImageAttributes]::new()
$attrs.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
$g.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, $Size, $Size), $srcX, $srcY, $side, $side, [System.Drawing.GraphicsUnit]::Pixel, $attrs)
$g.Dispose()

$od = $out.LockBits([System.Drawing.Rectangle]::new(0, 0, $Size, $Size), [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$px = New-Object byte[] ($od.Stride * $Size)
[System.Runtime.InteropServices.Marshal]::Copy($od.Scan0, $px, 0, $px.Length)
$out.UnlockBits($od)

$header = New-Object byte[] 18
$header[2] = 2                                   # uncompressed true-color
$header[12] = $Size -band 0xFF; $header[13] = ($Size -shr 8) -band 0xFF
$header[14] = $Size -band 0xFF; $header[15] = ($Size -shr 8) -band 0xFF
$header[16] = 32                                 # bits per pixel
$header[17] = 8                                  # 8 alpha bits, bottom-left origin
$fs = [System.IO.File]::Create($OutTga)
$fs.Write($header, 0, 18)
for ($y = $Size - 1; $y -ge 0; $y--) { $fs.Write($px, $y * $od.Stride, $Size * 4) }
$fs.Close()
"Wrote $OutTga ($((Get-Item $OutTga).Length) bytes)"
if ($PreviewPng) {
	$preview = [System.Drawing.Bitmap]::new(256, 128)
	$pg = [System.Drawing.Graphics]::FromImage($preview)
	$pg.Clear([System.Drawing.Color]::FromArgb(255, 30, 30, 34))
	$pg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
	$pg.DrawImage($out, 0, 0, 128, 128)       # the 64 px texture, doubled
	$pg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
	$pg.DrawImage($out, 150, 20, 20, 20)       # about minimap-button size
	$pg.DrawImage($out, 190, 20, 32, 32)
	$pg.Dispose()
	$preview.Save($PreviewPng, [System.Drawing.Imaging.ImageFormat]::Png)
	"Preview $PreviewPng"
}
$src.Dispose(); $out.Dispose()
