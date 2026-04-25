$ErrorActionPreference = 'Stop'

function U {
    param([int[]]$Codes)
    return (-join ($Codes | ForEach-Object { [char]$_ }))
}

function Set-WesternBodyFont {
    param($Font)
    $Font.Name = 'Times New Roman'
    $Font.NameAscii = 'Times New Roman'
    $Font.NameFarEast = 'SimSun'
    $Font.NameOther = 'Times New Roman'
}

function Set-ParagraphBodyFormat {
    param($Para)

    $Para.Alignment = 3
    $Para.CharacterUnitFirstLineIndent = 2
    $Para.LeftIndent = 0
    $Para.RightIndent = 0
    $Para.SpaceBefore = 0
    $Para.SpaceAfter = 0
    $Para.LineSpacingRule = 1

    $font = $Para.Range.Font
    Set-WesternBodyFont $font
    $font.Size = 12
    $font.Bold = 0
}

function Set-HeadingFormat {
    param(
        $Para,
        [double]$Size,
        [int]$Alignment,
        [int]$Bold = 1
    )

    $Para.Alignment = $Alignment
    $Para.CharacterUnitFirstLineIndent = 0
    $Para.LeftIndent = 0
    $Para.RightIndent = 0
    $Para.SpaceBefore = 6
    $Para.SpaceAfter = 6
    $Para.LineSpacingRule = 1

    $font = $Para.Range.Font
    $font.Name = 'SimHei'
    $font.NameFarEast = 'SimHei'
    $font.NameAscii = 'Times New Roman'
    $font.NameOther = 'Times New Roman'
    $font.Size = $Size
    $font.Bold = $Bold
}

function Add-PageBreakBeforeParagraph {
    param($Para)

    $start = $Para.Range.Start
    if ($start -le 1) {
        return
    }

    $probe = $Para.Range.Duplicate
    $probe.SetRange([Math]::Max(0, $start - 2), [Math]::Max(0, $start - 1))
    $prior = ($probe.Text -replace '[\r\a]+', '').Trim()
    if ($prior.Length -eq 0) {
        return
    }

    $insert = $Para.Range.Duplicate
    $insert.Collapse(1)
    $insert.InsertBreak(7)
}

$downloadsDir = 'C:\Users\31048\Downloads'
$inputFile = Get-ChildItem -LiteralPath $downloadsDir -Filter *.doc |
    Where-Object { $_.BaseName -notlike '*_formatted' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $inputFile) {
    throw 'No .doc file found in Downloads.'
}

$inputPath = $inputFile.FullName
$outputPath = Join-Path $inputFile.DirectoryName ($inputFile.BaseName + '_formatted.doc')
Copy-Item -LiteralPath $inputPath -Destination $outputPath -Force

$titleAbstract = U 25688,35201
$titleAbstractColon = U 25688,35201,65306
$titleToc = U 30446,24405
$titleRefs = U 21442,32771,25991,29486
$titleAppendix = U 38468,24405
$titleResultList = U 35774,35745,32467,26524,21015,34920

$headingTask = U 35774,35745,20219,21153,21450,25805,20316,26465,20214
$headingCalc = U 35774,35745,35745,31639
$headingParams = U 35774,35745,21442,25968
$headingTheory = U 24178,29157,21407,29702
$headingParamExplain = U 20027,35201,21442,25968,35828,26126

$labelCollege = U 23398,38498
$labelMajor = U 19987,19994
$labelClass = U 29677,32423
$labelName = U 22995,21517
$labelStudentId = U 23398,21495
$labelDate = U 23436,25104,26085,26399
$labels = @($labelCollege, $labelMajor, $labelClass, $labelName, $labelStudentId, $labelDate)
$cnColon = [Regex]::Escape((U 65306))
$labelPattern = '^(' + (($labels | ForEach-Object { [Regex]::Escape($_) }) -join '|') + ')(:|' + $cnColon + ')'

$chapterPrefix = [Regex]::Escape((U 31532))
$chapterSuffix = [Regex]::Escape((U 31456))
$chapterPattern = '^' + $chapterPrefix + '.+' + $chapterSuffix

$keywordPattern = '^' + [Regex]::Escape((U 20851,38190,35789)) + '(:|' + $cnColon + ')'
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

$majorTitles = @(
    $titleAbstract,
    $titleAbstractColon,
    $titleToc,
    $titleRefs,
    $titleAppendix,
    $titleResultList
)

$shortHeadingWhitelist = @(
    $headingTask,
    $headingCalc,
    $headingParams,
    $headingTheory,
    $headingParamExplain
)

$breakTargets = @(
    $titleAbstract,
    $titleAbstractColon,
    $titleToc,
    (U 31532,19968,31456,27010,36848),
    (U 31532,19968,31456,32,27010,36848),
    $titleRefs,
    $titleAppendix
)

$word = $null
$doc = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    $doc = $word.Documents.Open($outputPath, $false, $false)

    foreach ($section in $doc.Sections) {
        $setup = $section.PageSetup
        $setup.PaperSize = 7
        $setup.TopMargin = $word.CentimetersToPoints(2.5)
        $setup.BottomMargin = $word.CentimetersToPoints(2.5)
        $setup.LeftMargin = $word.CentimetersToPoints(3.0)
        $setup.RightMargin = $word.CentimetersToPoints(2.5)
        $setup.HeaderDistance = $word.CentimetersToPoints(1.5)
        $setup.FooterDistance = $word.CentimetersToPoints(1.75)
        $section.PageSetup.DifferentFirstPageHeaderFooter = $true
    }

    $doc.Content.ParagraphFormat.CharacterUnitFirstLineIndent = 2
    $doc.Content.ParagraphFormat.Alignment = 3
    $doc.Content.ParagraphFormat.LineSpacingRule = 1
    $doc.Content.ParagraphFormat.SpaceBefore = 0
    $doc.Content.ParagraphFormat.SpaceAfter = 0
    Set-WesternBodyFont $doc.Content.Font
    $doc.Content.Font.Size = 12
    $doc.Content.Font.Bold = 0

    $manualPageParas = New-Object System.Collections.ArrayList
    for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
        $para = $doc.Paragraphs.Item($i)
        if ($para.Range.Information(12)) {
            continue
        }

        $text = ($para.Range.Text -replace '[\r\a]+', '') -replace '\s+', ' '
        $text = $text.Trim()
        if ($text -match '^(?:[IVXLCDM]+|\d+)$') {
            [void]$manualPageParas.Add($para.Range.Duplicate)
        }
    }

    foreach ($range in $manualPageParas) {
        $range.Text = ''
    }

    for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
        $para = $doc.Paragraphs.Item($i)
        $styleName = ''
        try {
            $styleName = $para.Range.Style.NameLocal
        }
        catch {}

        $text = ($para.Range.Text -replace '[\r\a]+', '') -replace '\s+', ' '
        $text = $text.Trim()
        if ($text.Length -eq 0) {
            continue
        }

        if ($styleName -like 'TOC*') {
            $para.Alignment = 0
            $para.CharacterUnitFirstLineIndent = 0
            $para.SpaceBefore = 0
            $para.SpaceAfter = 0
            $para.LineSpacingRule = 0
            $font = $para.Range.Font
            Set-WesternBodyFont $font
            $font.Size = if ($styleName -eq 'TOC 1') { 12 } else { 11 }
            $font.Bold = 0
            continue
        }

        if ($i -eq 1) {
            Set-HeadingFormat -Para $para -Size 16 -Alignment 1 -Bold 1
            continue
        }

        if ($text -match $labelPattern) {
            $para.Alignment = 0
            $para.CharacterUnitFirstLineIndent = 0
            $para.LeftIndent = 0
            $para.RightIndent = 0
            $para.SpaceBefore = 3
            $para.SpaceAfter = 3
            $para.LineSpacingRule = 1

            $font = $para.Range.Font
            Set-WesternBodyFont $font
            $font.Size = 14
            $font.Bold = 0
            continue
        }

        if ($majorTitles -contains $text) {
            Set-HeadingFormat -Para $para -Size 16 -Alignment 1 -Bold 1
            continue
        }

        if ($text -match $chapterPattern) {
            Set-HeadingFormat -Para $para -Size 16 -Alignment 1 -Bold 1
            continue
        }

        if ($text -match '^\d+\.\d+(\.\d+)?') {
            $size = if ($text -match '^\d+\.\d+\.\d+') { 12 } else { 14 }
            Set-HeadingFormat -Para $para -Size $size -Alignment 0 -Bold 1
            continue
        }

        if ($text -match $enumPattern) {
            Set-HeadingFormat -Para $para -Size 12 -Alignment 0 -Bold 1
            continue
        }

        if ($shortHeadingWhitelist -contains $text) {
            Set-HeadingFormat -Para $para -Size 14 -Alignment 1 -Bold 1
            continue
        }

        if ($text -match $keywordPattern) {
            $para.Alignment = 0
            $para.CharacterUnitFirstLineIndent = 0
            $para.SpaceBefore = 3
            $para.SpaceAfter = 3
            $para.LineSpacingRule = 1

            $font = $para.Range.Font
            Set-WesternBodyFont $font
            $font.Size = 12
            $font.Bold = 0
            continue
        }

        Set-ParagraphBodyFormat $para
    }

    foreach ($table in $doc.Tables) {
        foreach ($row in $table.Rows) {
            foreach ($cell in $row.Cells) {
                $range = $cell.Range
                $range.End = $range.End - 1
                Set-WesternBodyFont $range.Font
                $range.Font.Size = 10.5
                $range.Font.Bold = 0
                $range.ParagraphFormat.Alignment = 1
                $range.ParagraphFormat.CharacterUnitFirstLineIndent = 0
                $range.ParagraphFormat.SpaceBefore = 0
                $range.ParagraphFormat.SpaceAfter = 0
                $range.ParagraphFormat.LineSpacingRule = 0
            }
        }
    }

    for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
        $para = $doc.Paragraphs.Item($i)
        $text = ($para.Range.Text -replace '[\r\a]+', '') -replace '\s+', ' '
        $text = $text.Trim()
        if ($breakTargets -contains $text) {
            Add-PageBreakBeforeParagraph $para
        }
    }

    foreach ($section in $doc.Sections) {
        foreach ($footerType in 1, 2, 3) {
            $section.Footers.Item($footerType).Range.Text = ''
        }

        $footer = $section.Footers.Item(1)
        $footer.PageNumbers.RestartNumberingAtSection = $false
        $footer.PageNumbers.Add(1) | Out-Null
        $footer.PageNumbers.NumberStyle = 0
        $footer.Range.ParagraphFormat.Alignment = 1
        $footer.Range.Font.Name = 'Times New Roman'
        $footer.Range.Font.NameAscii = 'Times New Roman'
        $footer.Range.Font.Size = 10.5
    }

    $doc.Save()
    Start-Sleep -Seconds 2
}
finally {
    if ($doc -ne $null) {
        for ($attempt = 1; $attempt -le 5; $attempt++) {
            try {
                $doc.Close([ref]0)
                break
            }
            catch {
                Start-Sleep -Seconds 2
            }
        }
    }
    if ($word -ne $null) {
        for ($attempt = 1; $attempt -le 5; $attempt++) {
            try {
                $word.Quit()
                break
            }
            catch {
                Start-Sleep -Seconds 2
            }
        }
    }
}

Write-Output "Saved: $outputPath"
