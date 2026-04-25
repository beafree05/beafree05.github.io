$ErrorActionPreference = 'Stop'

function U {
    param([int[]]$Codes)
    return (-join ($Codes | ForEach-Object { [char]$_ }))
}

$file = Get-ChildItem -LiteralPath 'C:\Users\31048\Downloads' -Filter '*.doc' |
    Where-Object { $_.Name -like '*recover vision*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $file) {
    throw 'Target document not found.'
}

$path = $file.FullName

$titleAbstract = (U 25688,35201,65306)
$titleToc = (U 30446,24405)
$titleRefs = (U 21442,32771,25991,29486,65306)
$titleAppendix = (U 38468,24405)
$dupTitle = '2.2万吨/年木薯淀粉的流化床干燥器设计'
$chapterPrefix = (U 31532)
$chapterSuffix = (U 31456)

function Clean-Text {
    param([string]$Text)
    $t = ($Text -replace '[\r\a\f]+', '') -replace '\s+', ' '
    return $t.Trim()
}

function Is-BlankPara {
    param($Para)
    $t = ($Para.Range.Text -replace '[\r\a\f]+', '')
    return [string]::IsNullOrWhiteSpace($t)
}

function Delete-AdjacentBlanks {
    param($Doc, [int]$Index)

    while ($Index -gt 1) {
        $prev = $Doc.Paragraphs.Item($Index - 1)
        if (Is-BlankPara $prev) {
            try { $prev.Range.Delete() | Out-Null } catch { break }
            $Index--
        }
        else {
            break
        }
    }

    while ($Index + 1 -le $Doc.Paragraphs.Count) {
        $next = $Doc.Paragraphs.Item($Index + 1)
        if (Is-BlankPara $next) {
            try { $next.Range.Delete() | Out-Null } catch { break }
        }
        else {
            break
        }
    }
}

function Ensure-PageBreakBefore {
    param($Doc, [int]$Index)

    if ($Index -le 1) { return }
    $para = $Doc.Paragraphs.Item($Index)
    Delete-AdjacentBlanks -Doc $Doc -Index $Index

    $start = $para.Range.Start
    $probe = $para.Range.Duplicate
    $probe.SetRange([Math]::Max(0, $start - 1), $start)
    $ch = $probe.Text
    if ($ch -eq [string][char]12) {
        return
    }

    $ins = $para.Range.Duplicate
    $ins.Collapse(1)
    $ins.InsertBreak(7)
}

$word = $null
$doc = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($path)

    $dupTitleRanges = New-Object System.Collections.ArrayList

    for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
        $para = $doc.Paragraphs.Item($i)
        $text = Clean-Text $para.Range.Text
        if ($text.Length -eq 0) { continue }

        if ($text -eq $dupTitle) {
            [void]$dupTitleRanges.Add($para.Range.Duplicate)
            continue
        }

    }

    foreach ($r in $dupTitleRanges) {
        try { $r.Delete() | Out-Null } catch {}
    }

    $targets = New-Object System.Collections.Generic.List[int]
    for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
        $text = Clean-Text $doc.Paragraphs.Item($i).Range.Text
        if ($text.Length -eq 0) { continue }

        if ($text -eq $titleAbstract -or $text -eq $titleToc -or $text -eq $titleRefs -or $text -eq $titleAppendix) {
            $targets.Add($i)
            continue
        }

        if ($text.StartsWith($chapterPrefix) -and $text.Contains($chapterSuffix)) {
            $targets.Add($i)
        }
    }

    for ($i = $targets.Count - 1; $i -ge 0; $i--) {
        $idx = $targets[$i]
        if ($idx -le $doc.Paragraphs.Count) {
            $current = Clean-Text $doc.Paragraphs.Item($idx).Range.Text
            if ($current.Length -eq 0) { continue }
            Ensure-PageBreakBefore -Doc $doc -Index $idx
        }
    }

    try {
        $doc.TablesOfContents.Item(1).Update()
    }
    catch {}

    $doc.Save()
    Write-Output "Updated: $path"
}
finally {
    if ($doc) { $doc.Close([ref]0) }
    if ($word) { $word.Quit() }
}
