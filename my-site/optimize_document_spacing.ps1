$ErrorActionPreference = 'Stop'

function U {
    param([int[]]$Codes)
    return (-join ($Codes | ForEach-Object { [char]$_ }))
}

$file = Get-ChildItem -LiteralPath 'C:\Users\31048\Downloads' -Filter '*.doc' |
    Where-Object { $_.Name -like '*recover vision*' -or $_.Name -like '*formatted*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $file) {
    throw 'Target document not found.'
}

$path = $file.FullName

$chapterPrefix = (U 31532)
$chapterSuffix = (U 31456)
$majorHeads = @(
    (U 25688,35201),
    (U 25688,35201,65306),
    (U 30446,24405),
    (U 35774,35745,20219,21153,21450,25805,20316,26465,20214),
    (U 35774,35745,35745,31639),
    (U 35774,35745,21442,25968),
    (U 21442,32771,25991,29486,65306),
    (U 21442,32771,25991,29486),
    (U 38468,24405),
    (U 20027,35201,21442,25968,35828,26126),
    (U 35774,35745,32467,26524,21015,34920)
)
$enumPattern = '^[' +
    (U 19968) +
    (U 20108) +
    (U 19977) +
    (U 22235) +
    (U 20116) +
    (U 20845) +
    (U 19971) +
    (U 20843) +
    (U 20061) +
    (U 21313) +
    ']+' + [Regex]::Escape((U 12289))

function Get-TextValue {
    param($Paragraph)
    $text = ($Paragraph.Range.Text -replace '[\r\a\f]+', '') -replace '\s+', ' '
    return $text.Trim()
}

function Is-BlankParagraph {
    param($Paragraph)
    $text = ($Paragraph.Range.Text -replace '[\r\a\f]+', '')
    return [string]::IsNullOrWhiteSpace($text)
}

function Is-HeadingParagraph {
    param($Paragraph)
    $text = Get-TextValue $Paragraph
    if ($text.Length -eq 0) { return $false }
    if ($majorHeads -contains $text) { return $true }
    if ($text.StartsWith($chapterPrefix) -and $text.Contains($chapterSuffix)) { return $true }
    if ($text -match '^\d+\.\d+(\.\d+)?') { return $true }
    if ($text -match $enumPattern) { return $true }
    return $false
}

function Is-InTable {
    param($Paragraph)
    try {
        return [bool]$Paragraph.Range.Information(12)
    }
    catch {
        return $false
    }
}

$word = $null
$doc = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($path)

    $deleted = 0

    for ($i = $doc.Paragraphs.Count; $i -ge 1; $i--) {
        $para = $doc.Paragraphs.Item($i)
        if (Is-InTable $para) {
            continue
        }

        if (-not (Is-BlankParagraph $para)) {
            continue
        }

        $prevIndex = $i - 1
        $nextIndex = $i + 1
        $prevPara = $null
        $nextPara = $null

        if ($prevIndex -ge 1) { $prevPara = $doc.Paragraphs.Item($prevIndex) }
        if ($nextIndex -le $doc.Paragraphs.Count) { $nextPara = $doc.Paragraphs.Item($nextIndex) }

        $deleteThis = $false

        if ($prevPara -and -not (Is-InTable $prevPara) -and (Is-BlankParagraph $prevPara)) {
            $deleteThis = $true
        }

        if (-not $deleteThis -and $nextPara -and -not (Is-InTable $nextPara) -and (Is-HeadingParagraph $nextPara)) {
            $deleteThis = $true
        }

        if (-not $deleteThis -and $prevPara -and -not (Is-InTable $prevPara) -and (Is-HeadingParagraph $prevPara)) {
            $deleteThis = $true
        }

        if (-not $deleteThis -and $i -gt 30) {
            $deleteThis = $true
        }

        if ($deleteThis) {
            try {
                $para.Range.Delete() | Out-Null
                $deleted++
            }
            catch {
            }
        }
    }

    $doc.Save()
    Write-Output ("Updated: {0}; deleted_blank_paragraphs={1}" -f $path, $deleted)
}
finally {
    if ($doc) { $doc.Close([ref]0) }
    if ($word) { $word.Quit() }
}
