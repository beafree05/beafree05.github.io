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
$knownHeads = @(
    (U 25688,35201),
    (U 30446,24405),
    (U 35774,35745,35745,31639),
    (U 35774,35745,21442,25968),
    (U 21442,32771,25991,29486),
    (U 38468,24405)
)

function Is-BlankParagraph {
    param($Paragraph)
    $text = ($Paragraph.Range.Text -replace '[\r\a\f]+', '') -replace '\s+', ''
    return [string]::IsNullOrWhiteSpace($text)
}

function Is-HeadingParagraph {
    param($Paragraph)
    $text = ($Paragraph.Range.Text -replace '[\r\a\f]+', '') -replace '\s+', ' '
    $text = $text.Trim()
    if ($text.Length -eq 0) { return $false }
    if ($text.StartsWith($chapterPrefix) -and $text.Contains($chapterSuffix)) { return $true }
    if ($knownHeads -contains $text) { return $true }
    if ($text -match '^\d+\.\d+(\.\d+)?') { return $true }
    return $false
}

$word = $null
$doc = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($path)

    $deleted = 0
    for ($i = $doc.Paragraphs.Count; $i -ge 2; $i--) {
        $para = $doc.Paragraphs.Item($i)
        if (-not (Is-HeadingParagraph $para)) {
            continue
        }

        $blankIndexes = New-Object System.Collections.Generic.List[int]
        for ($j = $i - 1; $j -ge 1; $j--) {
            $prev = $doc.Paragraphs.Item($j)
            if (Is-BlankParagraph $prev) {
                $blankIndexes.Add($j)
                continue
            }
            break
        }

        if ($blankIndexes.Count -gt 1) {
            for ($k = 0; $k -lt $blankIndexes.Count - 1; $k++) {
                $idx = $blankIndexes[$k]
                $doc.Paragraphs.Item($idx).Range.Delete()
                $deleted++
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
