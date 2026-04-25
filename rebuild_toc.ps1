$ErrorActionPreference = 'Stop'

function U {
    param([int[]]$Codes)
    return (-join ($Codes | ForEach-Object { [char]$_ }))
}

$workPath = (Get-ChildItem -Path (Get-Location) -Filter 'thesis_work.doc' | Select-Object -First 1).FullName
$targetFile = Get-ChildItem -LiteralPath 'C:\Users\31048\Downloads' -Filter '*.doc' |
    Where-Object { $_.Name -like '*recover vision*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $workPath) { throw 'Working copy not found.' }
if (-not $targetFile) { throw 'Target document not found.' }

$firstChapter = (U 31532,19968,31456,27010,36848)
$titleCalc = (U 35774,35745,35745,31639)
$thirdChapterPrefix = (U 31532,19977,31456)
$fourthChapterPrefix = (U 31532,22235,31456)
$resultList = (U 35774,35745,32467,26524,21015,34920)
$refData = (U 21442,32771,36164,26009,65306)
$appendix = (U 38468,24405)
$tocTitleText = (U 30446,24405)

$word = $null
$doc = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($workPath)

    $bodyHeads = @()
    for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
        $p = $doc.Paragraphs.Item($i)
        $style = ''
        try { $style = $p.Range.Style.NameLocal } catch {}
        $text = (($p.Range.Text -replace '[\r\a\f]+', '') -replace '\s+', ' ').Trim()
        if ($style -like 'TOC*') { continue }
        if (
            $text -eq $firstChapter -or
            $text -eq $titleCalc -or
            $text.StartsWith($thirdChapterPrefix) -or
            $text.StartsWith($fourthChapterPrefix) -or
            $text -eq $resultList -or
            $text -eq $refData -or
            $text -eq $appendix
        ) {
            $bodyHeads += [PSCustomObject]@{ Index = $i; Text = $text; Page = $p.Range.Information(3) }
        }
    }

    for ($i = $doc.Paragraphs.Count; $i -ge 1; $i--) {
        $p = $doc.Paragraphs.Item($i)
        $text = (($p.Range.Text -replace '[\r\a\f]+', '') -replace '\s+', ' ').Trim()
        if ($text -like '2.2*木薯淀粉*设计') {
            try { $p.Range.Delete() | Out-Null } catch {}
        }
    }

    $tocTitleIndex = $null
    $firstBodyIndex = $null
    for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
        $p = $doc.Paragraphs.Item($i)
        $style = ''
        try { $style = $p.Range.Style.NameLocal } catch {}
        $text = (($p.Range.Text -replace '[\r\a\f]+', '') -replace '\s+', ' ').Trim()
        if (-not $tocTitleIndex -and $text -eq $tocTitleText) { $tocTitleIndex = $i }
        if (-not $firstBodyIndex -and $style -notlike 'TOC*' -and $text -eq $firstChapter) { $firstBodyIndex = $i }
    }

    if (-not $tocTitleIndex -or -not $firstBodyIndex) {
        throw 'TOC anchors not found.'
    }

    for ($i = $firstBodyIndex - 1; $i -gt $tocTitleIndex; $i--) {
        try { $doc.Paragraphs.Item($i).Range.Delete() | Out-Null } catch {}
    }

    $tocTitle = $doc.Paragraphs.Item($tocTitleIndex)
    $tocTitle.PageBreakBefore = -1

    $tab = [char]9
    $insert = $tocTitle.Range.Duplicate
    $insert.Collapse(0)

    foreach ($head in $bodyHeads) {
        $line = $head.Text + $tab + $head.Page + "`r"
        $insert.InsertAfter($line)
    }

    $doc.Save()
    Copy-Item -LiteralPath $workPath -Destination $targetFile.FullName -Force
    Write-Output ("Updated: {0}" -f $targetFile.FullName)
}
finally {
    if ($doc) { $doc.Close([ref]0) }
    if ($word) { $word.Quit() }
}
