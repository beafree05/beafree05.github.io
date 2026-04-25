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
        $para = $doc.Paragraphs.Item($i)
        $styleName = ''
        try { $styleName = $para.Range.Style.NameLocal } catch {}
        $text = (($para.Range.Text -replace '[\r\a\f]+', '') -replace '\s+', ' ').Trim()

        if ($text -like '2.2*木薯淀粉*设计') {
            try { $para.Range.Delete() | Out-Null } catch {}
            continue
        }

        if ($styleName -eq 'TOC 2' -or $styleName -eq 'TOC 3') {
            try { $para.Range.Delete() | Out-Null } catch {}
            continue
        }

        if ($text.Length -eq 0 -and $i -gt 1 -and $i -lt $doc.Paragraphs.Count) {
            $prevStyle = ''
            $nextStyle = ''
            try { $prevStyle = $doc.Paragraphs.Item($i - 1).Range.Style.NameLocal } catch {}
            try { $nextStyle = $doc.Paragraphs.Item($i + 1).Range.Style.NameLocal } catch {}
            if (($prevStyle -like 'TOC*') -or ($nextStyle -like 'TOC*')) {
                try { $para.Range.Delete() | Out-Null } catch {}
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
