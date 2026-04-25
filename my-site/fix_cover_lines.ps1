$ErrorActionPreference = 'Stop'

function U {
    param([int[]]$Codes)
    return (-join ($Codes | ForEach-Object { [char]$_ }))
}

$file = Get-ChildItem -LiteralPath 'C:\Users\31048\Downloads' -Filter '*_formatted.doc' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $file) {
    throw 'Formatted document not found.'
}

$path = $file.FullName

function Get-CleanValue {
    param(
        [string]$Text,
        [string]$Label
    )

    $value = $Text -replace [Regex]::Escape($Label), ''
    $value = $value -replace '[_\s]+', ''
    return $value.Trim()
}

function Set-CoverFieldLine {
    param(
        $Para,
        [string]$Label,
        [string]$Value,
        [int]$FontSize = 18,
        [int]$FieldWidth = 26
    )

    $leftPad = [Math]::Max(2, [Math]::Floor(($FieldWidth - $Value.Length) / 3))
    $rightPad = [Math]::Max(4, $FieldWidth - $Value.Length - $leftPad)
    $fieldText = (' ' * $leftPad) + $Value + (' ' * $rightPad)
    $lineText = $Label + ' ' + $fieldText

    $paraRange = $Para.Range
    $paraRange.Text = $lineText + "`r"

    $Para.Alignment = 1
    $Para.LeftIndent = 0
    $Para.RightIndent = 0
    $Para.CharacterUnitFirstLineIndent = 0
    $Para.SpaceBefore = 6
    $Para.SpaceAfter = 6
    $Para.LineSpacingRule = 1

    $all = $Para.Range
    $all.End = $all.End - 1
    $all.Font.NameFarEast = 'SimSun'
    $all.Font.NameAscii = 'Times New Roman'
    $all.Font.Size = $FontSize
    $all.Font.Bold = 0
    $all.Font.Underline = 0

    $fieldStart = $all.Start + $Label.Length + 1
    $fieldRange = $all.Duplicate
    $fieldRange.SetRange($fieldStart, $all.End)
    $fieldRange.Font.Underline = 1
}

$labelCollege = U 23398,38498,65306
$labelMajor = U 19987,19994,65306
$labelClass = U 29677,32423,65306
$labelName = U 22995,21517,65306
$labelStudentId = U 23398,21495,65306
$labelDate = U 23436,25104,26085,26399,65306

$word = $null
$doc = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    $doc = $word.Documents.Open($path, $false, $false)

    $targets = @(
        @{ Index = 10; Label = $labelCollege; Size = 20; Width = 28 },
        @{ Index = 12; Label = $labelMajor; Size = 20; Width = 28 },
        @{ Index = 14; Label = $labelClass; Size = 20; Width = 28 },
        @{ Index = 16; Label = $labelName; Size = 20; Width = 28 },
        @{ Index = 18; Label = $labelStudentId; Size = 20; Width = 28 },
        @{ Index = 20; Label = $labelDate; Size = 18; Width = 24 }
    )

    foreach ($target in $targets) {
        $para = $doc.Paragraphs.Item($target.Index)
        $raw = ($para.Range.Text -replace '[\r\a]+', '').Trim()
        $value = Get-CleanValue -Text $raw -Label $target.Label
        Set-CoverFieldLine -Para $para -Label $target.Label -Value $value -FontSize $target.Size -FieldWidth $target.Width
    }

    $doc.Save()
}
finally {
    if ($doc) { $doc.Close([ref]0) }
    if ($word) { $word.Quit() }
}

Write-Output "Updated: $path"
