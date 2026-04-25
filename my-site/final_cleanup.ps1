$ErrorActionPreference = 'Stop'

$workPath = (Get-ChildItem -Path (Get-Location) -Filter 'thesis_work.doc' | Select-Object -First 1).FullName
$targetFile = Get-ChildItem -LiteralPath 'C:\Users\31048\Downloads' -Filter '*.doc' |
    Where-Object { $_.Name -like '*recover vision*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $workPath) { throw 'Working copy not found.' }
if (-not $targetFile) { throw 'Target document not found.' }

$word = $null
$doc = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($workPath)

    for ($i = $doc.Paragraphs.Count; $i -ge 1; $i--) {
        $p = $doc.Paragraphs.Item($i)
        $text = (($p.Range.Text -replace '[\r\a\f]+', '') -replace '\s+', ' ').Trim()
        if ($text -like '2.2*木薯淀粉*设计') {
            try { $p.Range.Delete() | Out-Null } catch {}
            continue
        }

        if ($i -gt 1 -and $i -lt $doc.Paragraphs.Count) {
            $prev = $doc.Paragraphs.Item($i - 1)
            $next = $doc.Paragraphs.Item($i + 1)
            $prevText = (($prev.Range.Text -replace '[\r\a\f]+', '') -replace '\s+', ' ').Trim()
            $nextText = (($next.Range.Text -replace '[\r\a\f]+', '') -replace '\s+', ' ').Trim()
            if ($text.Length -eq 0 -and $prevText -eq '附录' -or $false) {
            }
            if ($text.Length -eq 0 -and $nextText -eq '第一章概述') {
                try { $p.Range.Delete() | Out-Null } catch {}
                continue
            }
            if ($p.Range.Text.Contains([string][char]12) -and $nextText -eq '第一章概述') {
                try { $p.Range.Delete() | Out-Null } catch {}
                continue
            }
        }
    }

    $doc.Save()
    Copy-Item -LiteralPath $workPath -Destination $targetFile.FullName -Force
    Write-Output ("Updated: {0}" -f $targetFile.FullName)
}
finally {
    if ($doc) { $doc.Close([ref]0) }
    if ($word) { $word.Quit() }
}
