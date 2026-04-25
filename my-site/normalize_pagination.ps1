$ErrorActionPreference = 'Stop'

function U {
    param([int[]]$Codes)
    return (-join ($Codes | ForEach-Object { [char]$_ }))
}

$workFile = Get-ChildItem -Path (Get-Location) -Filter 'thesis_work.doc' -ErrorAction SilentlyContinue |
    Select-Object -First 1
$targetFile = Get-ChildItem -LiteralPath 'C:\Users\31048\Downloads' -Filter '*.doc' |
    Where-Object { $_.Name -like '*recover vision*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $workFile) {
    throw 'Working copy not found.'
}
if (-not $targetFile) {
    throw 'Target document not found.'
}

$workPath = $workFile.FullName

$titleAbstract = (U 25688,35201,65306)
$titleToc = (U 30446,24405)
$titleCalc = (U 35774,35745,35745,31639)
$titleRefs = (U 21442,32771,25991,29486,65306)
$titleRefData = (U 21442,32771,36164,26009)
$titleAppendix = (U 38468,24405)
$titleResultList = (U 35774,35745,32467,26524,21015,34920)
$dupTitle = '2.2万吨/年木薯淀粉的流化床干燥器设计'
$chapterPrefix = (U 31532)
$chapterSuffix = (U 31456)

function Clean-Text {
    param([string]$Text)
    $t = ($Text -replace '[\r\a\f]+', '') -replace '\s+', ' '
    return $t.Trim()
}

function Is-BlankParagraph {
    param($Paragraph)
    $t = $Paragraph.Range.Text -replace '[\r\a\f]+', ''
    return [string]::IsNullOrWhiteSpace($t)
}

$word = $null
$doc = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($workPath)

    for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
        $para = $doc.Paragraphs.Item($i)
        $raw = $para.Range.Text
        if ($raw.Contains([string][char]12)) {
            try {
                $para.Range.Text = $raw.Replace([string][char]12, '')
            }
            catch {
            }
        }
    }

    for ($i = $doc.Paragraphs.Count; $i -ge 1; $i--) {
        $para = $doc.Paragraphs.Item($i)
        $text = Clean-Text $para.Range.Text
        if ($text -eq $dupTitle -or $text.Contains('万吨/年木薯淀粉的流化床干燥器设计')) {
            try { $para.Range.Delete() | Out-Null } catch {}
            continue
        }

        if ($para.Range.Text.Contains([string][char]12) -and $text.Length -eq 0) {
            try { $para.Range.Delete() | Out-Null } catch {}
            continue
        }

        if (Is-BlankParagraph $para) {
            $prevBlank = $false
            $nextBlank = $false
            if ($i -gt 1) { $prevBlank = Is-BlankParagraph $doc.Paragraphs.Item($i - 1) }
            if ($i -lt $doc.Paragraphs.Count) { $nextBlank = Is-BlankParagraph $doc.Paragraphs.Item($i + 1) }
            if ($prevBlank -or $nextBlank) {
                try { $para.Range.Delete() | Out-Null } catch {}
            }
        }
    }

    for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
        $para = $doc.Paragraphs.Item($i)
        $text = Clean-Text $para.Range.Text
        $styleName = ''
        try { $styleName = $para.Range.Style.NameLocal } catch {}

        $para.PageBreakBefore = 0

        if ($text -eq $titleToc) {
            $para.PageBreakBefore = -1
            continue
        }

        if ($styleName -like 'TOC*') {
            continue
        }

        $needBreak = $false
        if ($text -eq $titleAbstract -or $text -eq $titleToc -or $text -eq $titleCalc -or $text -eq $titleRefs -or $text -eq $titleAppendix -or $text -eq $titleResultList) {
            $needBreak = $true
        }
        elseif ($text.StartsWith($titleRefData)) {
            $needBreak = $true
        }
        elseif ($text.StartsWith($chapterPrefix) -and $text.Contains($chapterSuffix)) {
            $needBreak = $true
        }

        if ($needBreak) {
            $para.PageBreakBefore = -1
        }
    }

    try {
        $doc.TablesOfContents.Item(1).Update()
    }
    catch {}

    $doc.Save()
    Copy-Item -LiteralPath $workPath -Destination $targetFile.FullName -Force
    Write-Output ("Updated: {0}" -f $targetFile.FullName)
}
finally {
    if ($doc) { $doc.Close([ref]0) }
    if ($word) { $word.Quit() }
}
