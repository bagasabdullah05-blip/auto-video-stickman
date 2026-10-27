Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem

$AgentDir = Split-Path -Parent $PSCommandPath
$MateriUrl = 'https://share.gemini.google/MoRNxzS5RZ4d'
$CrashLog = Join-Path $AgentDir 'crash.log'

[System.Windows.Forms.Application]::add_ThreadException({
  param($s, $e)
  try {
    ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $e.Exception.ToString()) | Out-File -LiteralPath $CrashLog -Append -Encoding UTF8
    [System.Windows.Forms.MessageBox]::Show(('Terjadi error, aplikasi tetap jalan: ' + $e.Exception.Message + "`nDetail: crash.log"), 'Viral Video Studio')
  } catch {}
})
[System.AppDomain]::CurrentDomain.add_UnhandledException({
  param($s, $e)
  try { ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $e.ExceptionObject.ToString()) | Out-File -LiteralPath $CrashLog -Append -Encoding UTF8 } catch {}
})

$C = @{
  Bg      = [System.Drawing.Color]::FromArgb(18, 20, 30)
  Panel   = [System.Drawing.Color]::FromArgb(26, 29, 42)
  Card    = [System.Drawing.Color]::FromArgb(32, 36, 52)
  Border  = [System.Drawing.Color]::FromArgb(55, 62, 85)
  Text    = [System.Drawing.Color]::FromArgb(235, 237, 245)
  Muted   = [System.Drawing.Color]::FromArgb(150, 158, 180)
  Red     = [System.Drawing.Color]::FromArgb(255, 77, 77)
  Green   = [System.Drawing.Color]::FromArgb(61, 220, 132)
  Blue    = [System.Drawing.Color]::FromArgb(79, 140, 255)
  Orange  = [System.Drawing.Color]::FromArgb(255, 162, 76)
  Purple  = [System.Drawing.Color]::FromArgb(176, 123, 255)
  Input   = [System.Drawing.Color]::FromArgb(16, 19, 29)
}

$FontUI = New-Object System.Drawing.Font('Segoe UI', 10)
$FontTitle = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
$FontSub = New-Object System.Drawing.Font('Segoe UI', 9)
$FontMono = New-Object System.Drawing.Font('Consolas', 9)

$state = @{
  PackDir = ''; StageDir = ''; VideoFile = ''
  NodeProc = $null; LogFile = ''; LogPos = 0
  Timer = $null; OnDone = $null
  AuthUrl = ''
}

function Write-Log($msg, $color) {
  if ($null -eq $color) { $color = $C.Text }
  $box = $script:logBox
  $box.SelectionStart = $box.TextLength
  $box.SelectionLength = 0
  $box.SelectionColor = $color
  $box.AppendText(('[' + (Get-Date -Format 'HH:mm:ss') + '] ' + $msg + "`r`n"))
  $box.SelectionColor = $box.ForeColor
  $box.ScrollToCaret()
}

function Run-Node($nodeArgs, $label, $onDone) {
  if ($state.NodeProc -and -not $state.NodeProc.HasExited) {
    Write-Log 'Masih ada proses berjalan, tunggu selesai dulu.' $C.Red
    return $false
  }
  $state.LogFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), 'vvs_' + [System.Guid]::NewGuid().ToString('N') + '.log')
  $state.LogPos = 0
  $state.OnDone = $onDone
  Write-Log ('--- ' + $label + ' ---') $C.Blue
  try {
    $argStr = ($nodeArgs | ForEach-Object { if ($_ -match '\s') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' '
    $state.NodeProc = Start-Process -FilePath 'node' -ArgumentList $argStr -WorkingDirectory $AgentDir -RedirectStandardOutput $state.LogFile -RedirectStandardError ($state.LogFile + '.err') -WindowStyle Hidden -PassThru
    $state.JobStart = Get-Date
    $state.Timer.Start()
    return $true
  } catch {
    Write-Log ('Gagal menjalankan: ' + $_.Exception.Message) $C.Red
    [System.Windows.Forms.MessageBox]::Show(('Gagal menjalankan perintah: ' + $_.Exception.Message), 'Viral Video Studio')
    return $false
  }
}

function Free-Out($out) {
  if (-not (Test-Path -LiteralPath $out)) { return $out }
  $ext = [System.IO.Path]::GetExtension($out)
  $base = $out.Substring(0, $out.Length - $ext.Length)
  $i = 2
  while (Test-Path -LiteralPath ($base + '_' + $i + $ext)) { $i++ }
  return ($base + '_' + $i + $ext)
}

function Get-Accounts {
  $list = @()
  $tok = Join-Path $AgentDir '.youtube-token.json'
  $ch = Join-Path $AgentDir 'channel.json'
  $disp = 'default (utama)'
  if (Test-Path -LiteralPath $ch) {
    try { $disp = 'default (' + (Get-Content -LiteralPath $ch -Raw | ConvertFrom-Json).title + ')' } catch {}
  } elseif (Test-Path -LiteralPath $tok) { $disp = 'default (terhubung)' }
  $list += [pscustomobject]@{ Key = 'default'; Display = $disp; Connected = (Test-Path -LiteralPath $tok) }
  $ad = Join-Path $AgentDir 'youtube-accounts'
  if (Test-Path -LiteralPath $ad) {
    foreach ($d in Get-ChildItem -LiteralPath $ad -Directory) {
      $t = Join-Path $d.FullName 'token.json'
      $c = Join-Path $d.FullName 'channel.json'
      $dd = $d.Name
      if (Test-Path -LiteralPath $c) {
        try { $dd = $d.Name + ' (' + (Get-Content -LiteralPath $c -Raw | ConvertFrom-Json).title + ')' } catch {}
      } elseif (Test-Path -LiteralPath $t) { $dd = $d.Name + ' (terhubung)' }
      $list += [pscustomobject]@{ Key = $d.Name; Display = $dd; Connected = (Test-Path -LiteralPath $t) }
    }
  }
  return $list
}

$script:suppressAutoGo = $false

function Refresh-Accounts {
  $script:suppressAutoGo = $true
  $sel = $null
  if ($script:cbAccount.SelectedItem) { $sel = $script:cbAccount.SelectedItem.Key }
  $script:cbAccount.Items.Clear()
  foreach ($a in Get-Accounts) { [void]$script:cbAccount.Items.Add($a) }
  $script:cbAccount.DisplayMember = 'Display'
  if ($sel) {
    foreach ($it in $script:cbAccount.Items) {
      if ($it.Key -eq $sel) { $script:cbAccount.SelectedItem = $it }
    }
  }
  if ((-not $script:cbAccount.SelectedItem) -and ($script:cbAccount.Items.Count -gt 0)) { $script:cbAccount.SelectedIndex = 0 }
  Update-AccountStatus
  $script:suppressAutoGo = $false
}

function Update-AccountStatus {
  $a = $script:cbAccount.SelectedItem
  if (-not $a) { return }
  $clientPath = Join-Path $AgentDir 'youtube-client.json'
  if ($a.Key -ne 'default') {
    $own = Join-Path $AgentDir ('youtube-accounts\' + $a.Key + '\client.json')
    if (Test-Path -LiteralPath $own) { $clientPath = $own }
  }
  $hasClient = Test-Path -LiteralPath $clientPath
  if ($a.Connected) { $script:pillStatus.Text = '● ' + $a.Display; $script:pillStatus.ForeColor = $C.Green }
  else { $script:pillStatus.Text = '○ ' + $a.Display + ' — belum login'; $script:pillStatus.ForeColor = $C.Orange }
  if ($hasClient) { $script:lblClientStat.Text = '✓ Client tersimpan untuk akun ini.'; $script:lblClientStat.ForeColor = $C.Green }
  else { $script:lblClientStat.Text = 'Client belum ada — isi Client ID/Secret di atas.'; $script:lblClientStat.ForeColor = $C.Muted }
  Set-ClientVisible ((-not $hasClient) -or $script:clientForceShow)
  Update-ConnectVisibility
}

function Update-ConnectVisibility {
  $a = $script:cbAccount.SelectedItem
  $connected = $a -and $a.Connected
  foreach ($c in @($script:btnAuth, $script:lblUrlNote, $script:txtAuthUrl, $script:btnOpenUrl) + @($script:step3Lbls)) {
    if ($c) { $c.Visible = -not $connected }
  }
  if ($script:lblConnectedNote) { $script:lblConnectedNote.Visible = $connected }
}

$script:clientBaseY = $null
$script:clientForceShow = $false

function Set-ClientVisible($show) {
  $movers = @($script:btnAuth, $script:btnDoctor, $script:lblUrlNote, $script:txtAuthUrl, $script:btnOpenUrl) + @($script:step3Lbls)
  if ($movers -contains $null) { return }
  if (-not $script:clientBaseY) {
    $script:clientBaseY = @{}
    foreach ($c in $movers) { $script:clientBaseY[$c.GetHashCode()] = @{ C = $c; Y = $c.Location.Y } }
  }
  $off = 0
  if (-not $show) { $off = -150 }
  foreach ($k in $script:clientBaseY.Keys) {
    $e = $script:clientBaseY[$k]
    $e.C.Location = New-Object System.Drawing.Point($e.C.Location.X, ($e.Y + $off))
  }
  foreach ($c in @($script:lblCidL, $script:txtCid, $script:lblCsecL, $script:txtCsec, $script:btnSaveClient)) {
    if ($c) { $c.Visible = $show }
  }
  if ($script:btnClientEdit) { $script:btnClientEdit.Visible = -not $show }
}

function Style-Button($b, $bg) {
  $b.FlatStyle = 'Flat'
  $b.FlatAppearance.BorderSize = 0
  $b.BackColor = $bg
  $b.ForeColor = [System.Drawing.Color]::White
  $b.Font = $FontUI
  $b.Cursor = 'Hand'
}

function Style-Input($t) {
  $t.BackColor = $C.Input
  $t.ForeColor = $C.Text
  if ($t.PSObject.Properties['BorderStyle']) { $t.BorderStyle = 'FixedSingle' }
  $t.Font = $FontUI
}

function New-Lbl($parent, $text, $x, $y, $w, $h, $fg) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text
  $l.Location = New-Object System.Drawing.Point($x, $y)
  $l.Size = New-Object System.Drawing.Size($w, $h)
  $l.Font = $FontUI
  if ($fg) { $l.ForeColor = $fg } else { $l.ForeColor = $C.Text }
  $l.BackColor = [System.Drawing.Color]::Transparent
  [void]$parent.Controls.Add($l)
  return $l
}

function New-Btn($parent, $text, $x, $y, $w, $h, $bg, $action) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text
  $b.Location = New-Object System.Drawing.Point($x, $y)
  $b.Size = New-Object System.Drawing.Size($w, $h)
  Style-Button $b $bg
  $b.Add_Click($action)
  [void]$parent.Controls.Add($b)
  return $b
}

function New-Txt($parent, $x, $y, $w, $h, $multi) {
  $t = New-Object System.Windows.Forms.TextBox
  $t.Location = New-Object System.Drawing.Point($x, $y)
  $t.Size = New-Object System.Drawing.Size($w, $h)
  if ($multi) { $t.Multiline = $true; $t.ScrollBars = 'Vertical' }
  Style-Input $t
  [void]$parent.Controls.Add($t)
  return $t
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Viral Video Studio'
$form.Size = New-Object System.Drawing.Size(980, 720)
$form.MinimumSize = New-Object System.Drawing.Size(880, 600)
$form.StartPosition = 'CenterScreen'
$form.BackColor = $C.Bg
$form.Font = $FontUI

$header = New-Object System.Windows.Forms.Panel
$header.Dock = 'Top'
$header.Height = 74
$header.BackColor = $C.Panel
$form.Controls.Add($header) | Out-Null

$accent = New-Object System.Windows.Forms.Panel
$accent.Dock = 'Bottom'
$accent.Height = 3
$accent.BackColor = $C.Red
$header.Controls.Add($accent) | Out-Null

$lblApp = New-Object System.Windows.Forms.Label
$lblApp.Text = '▶  VIRAL VIDEO STUDIO'
$lblApp.Font = $FontTitle
$lblApp.ForeColor = [System.Drawing.Color]::White
$lblApp.Location = New-Object System.Drawing.Point(18, 8)
$lblApp.Size = New-Object System.Drawing.Size(500, 32)
$header.Controls.Add($lblApp) | Out-Null

$lblTag = New-Object System.Windows.Forms.Label
$lblTag.Text = 'Dari materi sampai tayang di YouTube — otomatis'
$lblTag.Font = $FontSub
$lblTag.ForeColor = $C.Muted
$lblTag.Location = New-Object System.Drawing.Point(20, 40)
$lblTag.Size = New-Object System.Drawing.Size(500, 20)
$header.Controls.Add($lblTag) | Out-Null

$script:pillStatus = New-Object System.Windows.Forms.Label
$script:pillStatus.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$script:pillStatus.TextAlign = 'MiddleRight'
$script:pillStatus.Anchor = 'Top, Right'
$script:pillStatus.Location = New-Object System.Drawing.Point(580, 22)
$script:pillStatus.AutoSize = $true
$header.Controls.Add($script:pillStatus) | Out-Null

$nav = New-Object System.Windows.Forms.Panel
$nav.Dock = 'Left'
$nav.Width = 210
$nav.BackColor = $C.Panel
$form.Controls.Add($nav) | Out-Null

$navHead = New-Object System.Windows.Forms.Label
$navHead.Text = 'MENU TAHAPAN'
$navHead.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$navHead.ForeColor = $C.Muted
$navHead.Location = New-Object System.Drawing.Point(14, 12)
$navHead.Size = New-Object System.Drawing.Size(180, 24)
$nav.Controls.Add($navHead) | Out-Null

$content = New-Object System.Windows.Forms.Panel
$content.Dock = 'Fill'
$content.BackColor = $C.Bg
$form.Controls.Add($content) | Out-Null

$script:navBtns = @{}
$script:curPage = $null

function Show-Page($page) {
  foreach ($p in @($tabAkun, $tabMateri, $tabPaket, $tabDeskripsi, $tabUpload, $tabVideos)) {
    if ($p) { $p.Visible = ($p -eq $page) }
  }
  $script:curPage = $page
  foreach ($k in @($script:navBtns.Keys)) {
    $b = $script:navBtns[$k]
    if ($k -eq $page) { $b.BackColor = $C.Red } else { $b.BackColor = $C.Card }
  }
}

function New-NavBtn($label, $page, $y) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $label
  $b.Location = New-Object System.Drawing.Point(12, $y)
  $b.Size = New-Object System.Drawing.Size(186, 62)
  $b.FlatStyle = 'Flat'
  $b.FlatAppearance.BorderSize = 0
  $b.BackColor = $C.Card
  $b.ForeColor = [System.Drawing.Color]::White
  $b.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
  $b.TextAlign = 'MiddleLeft'
  $b.Cursor = 'Hand'
  $pg = $page
  $b.Add_Click({ Show-Page $pg }.GetNewClosure())
  [void]$nav.Controls.Add($b)
  $script:navBtns[$page] = $b
  return $b
}

function New-Tab($title) {
  $t = New-Object System.Windows.Forms.Panel
  $t.Dock = 'Fill'
  $t.BackColor = $C.Bg
  $t.Padding = New-Object System.Windows.Forms.Padding(16)
  $t.AutoScroll = $true
  $t.Visible = $false
  $t.Tag = $title
  $content.Controls.Add($t) | Out-Null
  return $t
}

function Step-Label($parent, $num, $text, $y) {
  $n = New-Object System.Windows.Forms.Label
  $n.Text = $num
  $n.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
  $n.ForeColor = [System.Drawing.Color]::White
  $n.BackColor = $C.Red
  $n.TextAlign = 'MiddleCenter'
  $n.Location = New-Object System.Drawing.Point(16, $y)
  $n.Size = New-Object System.Drawing.Size(30, 30)
  [void]$parent.Controls.Add($n)
  New-Lbl $parent $text 54 $y 700 30 | Out-Null
}

$tabAkun = New-Tab '1. Akun YouTube'
Step-Label $tabAkun '1' 'Pilih akun YouTube yang dipakai.' 16
$script:cbAccount = New-Object System.Windows.Forms.ComboBox
$script:cbAccount.Location = New-Object System.Drawing.Point(54, 52)
$script:cbAccount.Size = New-Object System.Drawing.Size(420, 28)
$script:cbAccount.DropDownStyle = 'DropDownList'
$script:cbAccount.Font = $FontUI
Style-Input $script:cbAccount
$script:cbAccount.add_SelectedIndexChanged({
  Update-AccountStatus
  if (-not $script:suppressAutoGo) {
    $a = $script:cbAccount.SelectedItem
    if ($a -and $a.Connected -and ($script:curPage -eq $tabAkun)) {
      Show-Page $tabMateri
    }
  }
})
[void]$tabAkun.Controls.Add($script:cbAccount)
$btnNewAcct = New-Btn $tabAkun '+ Akun Baru' 484 50 130 30 $C.Blue {
  Add-Type -AssemblyName Microsoft.VisualBasic
  $n = [Microsoft.VisualBasic.Interaction]::InputBox('Nama akun baru (misal: channel2):', 'Tambah Akun YouTube', '')
  if ($n -match '^\w[\w-]*$') {
    New-Item -ItemType Directory -Path (Join-Path $AgentDir ('youtube-accounts\' + $n)) -Force | Out-Null
    Refresh-Accounts
    foreach ($it in $script:cbAccount.Items) { if ($it.Key -eq $n) { $script:cbAccount.SelectedItem = $it } }
    Write-Log ('Akun "' + $n + '" dibuat. Isi Client ID/Secret lalu Hubungkan.') $C.Green
  } elseif ($n) { [System.Windows.Forms.MessageBox]::Show('Nama hanya huruf, angka, dan dash.') }
}
Step-Label $tabAkun '2' 'Isi Client ID + Secret (Google Cloud → OAuth Desktop app), sekali saja per akun.' 96
$lblCidL = New-Lbl $tabAkun 'Client ID' 54 130 660 20 $C.Muted
$txtCid = New-Txt $tabAkun 54 152 660 28 $false
$lblCsecL = New-Lbl $tabAkun 'Client Secret' 54 186 660 20 $C.Muted
$txtCsec = New-Txt $tabAkun 54 208 660 28 $false
$script:lblClientStat = New-Lbl $tabAkun '' 54 242 490 22 $C.Muted
$script:btnClientEdit = New-Btn $tabAkun 'Ubah Client' 550 238 150 30 $C.Blue {
  $script:clientForceShow = $true
  Set-ClientVisible $true
}
$script:btnClientEdit.Visible = $false
$btnSaveClient = New-Btn $tabAkun 'Simpan Client' 54 270 180 36 $C.Blue {
  $a = $script:cbAccount.SelectedItem
  if (-not $a) { return }
  if (-not $script:txtCid.Text.Trim() -or -not $script:txtCsec.Text.Trim()) { [System.Windows.Forms.MessageBox]::Show('Isi Client ID dan Secret dulu.'); return }
  $obj = @{ client_id = $script:txtCid.Text.Trim(); client_secret = $script:txtCsec.Text.Trim() } | ConvertTo-Json
  if ($a.Key -eq 'default') { $p = Join-Path $AgentDir 'youtube-client.json' }
  else { $p = Join-Path $AgentDir ('youtube-accounts\' + $a.Key + '\client.json') }
  $obj | Set-Content -LiteralPath $p -Encoding UTF8
  Write-Log ('Client tersimpan untuk akun "' + $a.Key + '".') $C.Green
  $script:clientForceShow = $false
  Update-AccountStatus
}
Step-Label $tabAkun '3' 'Hubungkan akun, lalu cek dengan Diagnosa.' 320
$step3Lbls = @($tabAkun.Controls[$tabAkun.Controls.Count - 2], $tabAkun.Controls[$tabAkun.Controls.Count - 1])
$script:lblConnectedNote = New-Object System.Windows.Forms.Label
$script:lblConnectedNote.Text = 'Akun ini sudah terhubung. Silakan lanjut ke tab 2.'
$script:lblConnectedNote.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$script:lblConnectedNote.ForeColor = $C.Green
$script:lblConnectedNote.Location = New-Object System.Drawing.Point(54, 354)
$script:lblConnectedNote.Size = New-Object System.Drawing.Size(600, 40)
$script:lblConnectedNote.Visible = $false
[void]$tabAkun.Controls.Add($script:lblConnectedNote)
$btnAuth = New-Btn $tabAkun 'Hubungkan Akun Ini' 54 354 220 40 $C.Red {
  $btn = $this
  try {
    $a = $script:cbAccount.SelectedItem
    if (-not $a) { return }
    if ($a.Key -eq 'default') { $cliPath = Join-Path $AgentDir 'youtube-client.json' }
    else {
      $cliPath = Join-Path $AgentDir ('youtube-accounts\' + $a.Key + '\client.json')
      if (-not (Test-Path -LiteralPath $cliPath)) { $cliPath = Join-Path $AgentDir 'youtube-client.json' }
    }
    if (-not (Test-Path -LiteralPath $cliPath)) {
      [System.Windows.Forms.MessageBox]::Show('Client belum ada. Isi Client ID + Secret lalu klik Simpan Client dulu.')
      return
    }
    $aa = @()
    if ($a.Key -ne 'default') { $aa = @('--account', $a.Key) }
    $state.AuthUrl = ''
    $script:txtAuthUrl.Text = ''
    if ($a.Key -eq 'default') { $state.AuthTok = Join-Path $AgentDir '.youtube-token.json' }
    else { $state.AuthTok = Join-Path $AgentDir ('youtube-accounts\' + $a.Key + '\token.json') }
    $state.AuthAcct = $a.Key
    $btn.Enabled = $false
    $btn.Text = 'Menghubungkan...'
    Run-Node (@('run.js', 'youtube', 'auth') + $aa) ('Login akun ' + $a.Key) {
      try { $btn.Enabled = $true } catch {}
      try { $btn.Text = 'Hubungkan Akun Ini' } catch {}
      Refresh-Accounts
      if ((Test-Path -LiteralPath $state.AuthTok)) {
        Write-Log ('Akun "' + $state.AuthAcct + '" TERHUBUNG.') $C.Green
        Show-Page $tabMateri
        [System.Windows.Forms.MessageBox]::Show(('Akun "' + $state.AuthAcct + '" terhubung. Lanjut ke tab 2.'))
      } else {
        Write-Log 'Login belum selesai / gagal. Klik Diagnosa Koneksi untuk detail.' $C.Red
        [System.Windows.Forms.MessageBox]::Show('Login belum selesai. Pastikan kamu klik Allow di browser, lalu klik Diagnosa Koneksi.')
      }
    } | Out-Null
    Write-Log 'Menunggu login di browser...' $C.Blue
  } catch {
    Write-Log ('Gagal memulai: ' + $_.Exception.Message) $C.Red
    [System.Windows.Forms.MessageBox]::Show(('Gagal memulai: ' + $_.Exception.Message), 'Viral Video Studio')
    try { $btn.Enabled = $true; $btn.Text = 'Hubungkan Akun Ini' } catch {}
  }
}
$btnDoctor = New-Btn $tabAkun 'Diagnosa Koneksi' 284 354 220 40 $C.Blue {
  $a = $script:cbAccount.SelectedItem
  if (-not $a) { return }
  $aa = @()
  if ($a.Key -ne 'default') { $aa = @('--account', $a.Key) }
  Run-Node (@('run.js', 'youtube', 'doctor') + $aa) 'Diagnosa koneksi' { Refresh-Accounts } | Out-Null
}
$lblUrlNote = New-Lbl $tabAkun 'Link login (jika browser tidak terbuka otomatis, salin link ini):' 54 402 660 20 $C.Muted
$script:txtAuthUrl = New-Txt $tabAkun 54 424 540 28 $false
$script:txtAuthUrl.ReadOnly = $true
$btnOpenUrl = New-Btn $tabAkun 'Buka' 604 422 70 32 $C.Blue {
  if ($script:txtAuthUrl.Text.Trim()) { Start-Process $script:txtAuthUrl.Text.Trim() }
  else { [System.Windows.Forms.MessageBox]::Show('Klik Hubungkan Akun Ini dulu.') }
}
Step-Label $tabAkun '4' 'Panduan Google Cloud (ikuti sekali saja, urut dari atas).' 462
$txtGuide = New-Txt $tabAkun 54 496 660 250 $true
$txtGuide.ReadOnly = $true
$txtGuide.Text = @'
1. Buka console.cloud.google.com, login akun Google kamu.
2. Pilih / buat Project baru (misal: VideoStudio).
3. Menu "API & Services > Library", cari "YouTube Data API v3", klik ENABLE.
4. Menu "OAuth consent screen", pilih External, Create.
   - Isi App name + email kamu, Save sampai selesai.
   - Di halaman Test users, tambah email kamu, Save.
5. Menu "Credentials > Create Credentials > OAuth client ID".
   - Application type: DESKTOP APP, beri nama, Create.
6. Salin Client ID + Client Secret ke kolom Langkah 2 di atas,
   klik Simpan Client.
7. Klik Hubungkan Akun Ini. Browser terbuka: pilih akun > Allow.
8. Status di atas berubah hijau TERHUBUNG. Selesai!

Jika muncul "Google has not verified this app":
klik Advanced > Go to ProjectName (aman, ini project sendiri).
'@

$tabMateri = New-Tab '2. Buat Materi'
Step-Label $tabMateri '1' 'Buat paket materi (script + gambar + suara) di Gemini.' 16
$btnGemini = New-Btn $tabMateri 'Buka Gemini Pembuat Materi  ↗' 54 54 300 42 $C.Purple {
  Start-Process $MateriUrl
  Write-Log 'Membuka Gemini pembuat materi di browser.'
}
New-Lbl $tabMateri 'Link materi:' 54 110 660 20 $C.Muted | Out-Null
$lnkMateri = New-Object System.Windows.Forms.LinkLabel
$lnkMateri.Text = $MateriUrl
$lnkMateri.LinkColor = $C.Blue
$lnkMateri.Font = $FontUI
$lnkMateri.Location = New-Object System.Drawing.Point(54, 132)
$lnkMateri.Size = New-Object System.Drawing.Size(660, 24)
$lnkMateri.Add_Click({ Start-Process $MateriUrl })
[void]$tabMateri.Controls.Add($lnkMateri)
Step-Label $tabMateri '2' 'Unduh hasilnya sebagai ZIP, lanjut ke tab "3. Paket ZIP".' 168

$tabPaket = New-Tab '3. Paket ZIP'
Step-Label $tabPaket '1' 'Pilih file ZIP paket viral.' 16
$txtZip = New-Txt $tabPaket 54 52 520 28 $false
$txtZip.ReadOnly = $true
$btnZip = New-Btn $tabPaket 'Pilih ZIP...' 584 50 140 32 $C.Orange {
  $d = New-Object System.Windows.Forms.OpenFileDialog
  $d.Filter = 'ZIP paket viral (*.zip)|*.zip'
  if ($d.ShowDialog() -eq 'OK') {
    $script:txtZip.Text = $d.FileName
    Import-Pack $d.FileName
  }
}
$lblPack = New-Txt $tabPaket 54 88 660 50 $true
$lblPack.ReadOnly = $true
$lblPack.Text = 'Belum ada paket.'
Step-Label $tabPaket '2' 'Rakit jadi video (WebCodecs — hitungan detik).' 142
$cbEngine = New-Object System.Windows.Forms.ComboBox
$cbEngine.Location = New-Object System.Drawing.Point(54, 178)
$cbEngine.Size = New-Object System.Drawing.Size(220, 28)
$cbEngine.DropDownStyle = 'DropDownList'
$cbEngine.Font = $FontUI
Style-Input $cbEngine
[void]$cbEngine.Items.Add('webcodecs (detik)')
[void]$cbEngine.Items.Add('ffmpeg (lambat)')
$cbEngine.SelectedIndex = 0
$cbEngine.DropDownWidth = 260
[void]$tabPaket.Controls.Add($cbEngine)
$btnRakit = New-Btn $tabPaket 'Rakit Video' 284 174 200 36 $C.Red {
  if (-not $state.PackDir) { [System.Windows.Forms.MessageBox]::Show('Pilih ZIP dulu.'); return }
  $engine = 'webcodecs'
  if ($script:cbEngine.SelectedIndex -eq 1) { $engine = 'ffmpeg' }
  $base = [System.IO.Path]::GetFileNameWithoutExtension($script:txtZip.Text)
  $out = Free-Out (Join-Path $AgentDir ('05-video\' + $base + '.mp4'))
  $state.VideoFile = $out
  $state.StageDir = Join-Path $AgentDir ('06-viral\' + $base)
  Run-Node @('run.js', 'viral', '--dir', $state.PackDir, '--out', $out, '--engine', $engine) 'Rakit video' {
    if (Test-Path -LiteralPath $state.VideoFile) {
      Write-Log ('SELESAI: ' + $state.VideoFile) $C.Green
      Update-ThumbStat
      [System.Windows.Forms.MessageBox]::Show(('Video jadi: ' + $state.VideoFile + "`nLanjut ke tab Deskripsi."))
Show-Page $tabDeskripsi
    } else {
      Write-Log 'Rakit gagal, cek log di atas.' $C.Red
    }
  } | Out-Null
}
$btnPlay = New-Btn $tabPaket 'Putar Hasil' 494 174 150 36 $C.Green {
  if ($state.VideoFile -and (Test-Path -LiteralPath $state.VideoFile)) { Start-Process $state.VideoFile }
  else { [System.Windows.Forms.MessageBox]::Show('Belum ada video hasil.') }
}
$btnFullAuto = New-Btn $tabPaket 'OTOMATIS: Rakit + Deskripsi + Upload' 54 220 590 40 $C.Green {
  Start-FullAuto $this
}

function Auto-Fail($msg) {
  Write-Log $msg $C.Red
  [System.Windows.Forms.MessageBox]::Show($msg)
  Auto-Done
}

function Auto-Done {
  try { $state.AutoBtn.Enabled = $true } catch {}
  $state.AutoBtn = $null
}

function Start-FullAuto($btn) {
  if (-not $state.PackDir) { [System.Windows.Forms.MessageBox]::Show('Pilih ZIP dulu di tab ini.'); return }
  if ($script:cbMode.SelectedIndex -eq 1) {
    [System.Windows.Forms.MessageBox]::Show('Mode Manual aktif. Pilih mode Otomatis dulu di tab 5.');
    Show-Page $tabUpload
    return
  }
  $a = $script:cbAccount.SelectedItem
  if (-not $a -or -not $a.Connected) {
    [System.Windows.Forms.MessageBox]::Show('Hubungkan akun YouTube dulu di tab 1.');
Show-Page $tabAkun
    return
  }
  $engine = 'webcodecs'
  if ($script:cbEngine.SelectedIndex -eq 1) { $engine = 'ffmpeg' }
  $base = [System.IO.Path]::GetFileNameWithoutExtension($script:txtZip.Text)
  $state.VideoFile = Free-Out (Join-Path $AgentDir ('05-video\' + $base + '.mp4'))
  $state.StageDir = Join-Path $AgentDir ('06-viral\' + $base)
  $state.AutoBtn = $btn
  $btn.Enabled = $false
  Write-Log '=== OTOMATIS (1/3): rakit video ===' $C.Green
  Run-Node @('run.js', 'viral', '--dir', $state.PackDir, '--out', $state.VideoFile, '--engine', $engine) 'Otomatis 1/3 rakit' {
    if (-not (Test-Path -LiteralPath $state.VideoFile)) { Auto-Fail 'Rakit gagal, otomatis berhenti.'; return }
    Write-Log '=== OTOMATIS (2/3): deskripsi ===' $C.Green
    $sfile = Get-ChildItem -LiteralPath (Join-Path $state.StageDir '01-script') -Filter '*.txt' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $sfile) { Auto-Fail 'Script tidak ada, otomatis berhenti.'; return }
    $dargs = @('run.js', 'describe', '--script', $sfile.FullName, '--stamp', (Join-Path $state.StageDir '03-prompt\timestamp.txt'), '--cut', (Join-Path $state.StageDir '03-prompt\cutpoints.json'), '--out', (Join-Path $state.StageDir '05-video\description.txt'))
    $ptf = Join-Path $state.StageDir '05-video\title.txt'
    $pdf = Join-Path $state.StageDir '05-video\description-src.txt'
    if (Test-Path -LiteralPath $ptf) { $dargs += @('--title-file', $ptf) }
    if (Test-Path -LiteralPath $pdf) { $dargs += @('--desc-file', $pdf) }
    Run-Node $dargs 'Otomatis 2/3 deskripsi' {
      $meta = Join-Path $state.StageDir '05-video\upload-meta.json'
      if (-not (Test-Path -LiteralPath $meta)) { Auto-Fail 'Deskripsi gagal, otomatis berhenti.'; return }
      $m = Get-Content -LiteralPath $meta -Raw | ConvertFrom-Json
      $script:txtTitle.Text = $m.title
      $script:txtDesc.Text = $m.description
      $script:txtVideo.Text = $state.VideoFile
      Write-Log '=== OTOMATIS (3/3): upload ===' $C.Green
      $a2 = $script:cbAccount.SelectedItem
      $priv = @('unlisted', 'private', 'public')[$script:cbPrivacy.SelectedIndex]
      $cmd = @('run.js', 'youtube', 'upload', '--video', $state.VideoFile, '--title', $m.title, '--privacy', $priv)
      if ($script:txtDesc.Text.Trim()) { $cmd += @('--description', $script:txtDesc.Text) }
      if ($a2.Key -ne 'default') { $cmd += @('--account', $a2.Key) }
      if ($script:chkSchedule.Checked) { $cmd += @('--publish-at', (Get-Date $script:dtSchedule.Value).ToString('yyyy-MM-ddTHH:mm:sszzz')) }
      $thp = Stage-Thumb
      if ($thp) { $cmd += @('--thumbnail', $thp) }
      Run-Node $cmd 'Otomatis 3/3 upload' {
        $mt = [regex]::Match($script:logBox.Text, 'youtube\.com/watch\?v=[\w-]+')
        if ($mt.Success) {
          Write-Log ('SELESAI OTOMATIS: https://' + $mt.Value) $C.Green
          [System.Windows.Forms.MessageBox]::Show(('Selesai! Link video: https://' + $mt.Value))
        } else {
          Write-Log 'Upload selesai, cek link di log atas.' $C.Green
          [System.Windows.Forms.MessageBox]::Show('Upload selesai. Cek link di log bawah.')
        }
        Auto-Done
      } | Out-Null
    } | Out-Null
  } | Out-Null
}

function Import-Pack($zipPath) {
  try {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($zipPath)
    $dest = Join-Path $AgentDir ('06-viral\_pack\' + $base)
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Write-Log ('Mengekstrak ' + $base + '...') $C.Blue
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $dest)
    $state.PackDir = $dest
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'node'
    $psi.Arguments = 'run.js viral --dir "' + $dest + '" --info'
    $psi.WorkingDirectory = $AgentDir
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $info = $p.StandardOutput.ReadToEnd()
    $p.WaitForExit()
    $script:lblPack.Text = ($info.Trim() -replace "`r?`n", '  |  ')
    $script:lblPack.ForeColor = $C.Text
    Write-Log ('Paket siap: ' + $base) $C.Green
  } catch {
    Write-Log ('Gagal ekstrak: ' + $_.Exception.Message) $C.Red
  }
}

$tabDeskripsi = New-Tab '4. Deskripsi'
Step-Label $tabDeskripsi '1' 'Buat judul, deskripsi + chapters, dan tags otomatis dari timestamp.' 16
$btnDesc = New-Btn $tabDeskripsi 'Buat Deskripsi' 54 52 200 36 $C.Blue {
  if (-not $state.StageDir) { [System.Windows.Forms.MessageBox]::Show('Rakit video dulu di tab Paket ZIP.'); return }
  $sdir = Join-Path $state.StageDir '01-script'
  $sfile = Get-ChildItem -LiteralPath $sdir -Filter '*.txt' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $sfile) { [System.Windows.Forms.MessageBox]::Show('Script tidak ada di stage.'); return }
  $out = Join-Path $state.StageDir '05-video\description.txt'
  $dargs = @('run.js', 'describe', '--script', $sfile.FullName, '--stamp', (Join-Path $state.StageDir '03-prompt\timestamp.txt'), '--cut', (Join-Path $state.StageDir '03-prompt\cutpoints.json'), '--out', $out)
  $ptf = Join-Path $state.StageDir '05-video\title.txt'
  $pdf = Join-Path $state.StageDir '05-video\description-src.txt'
  if (Test-Path -LiteralPath $ptf) { $dargs += @('--title-file', $ptf) }
  if (Test-Path -LiteralPath $pdf) { $dargs += @('--desc-file', $pdf) }
  Run-Node $dargs 'Buat deskripsi' {
    $meta = Join-Path $state.StageDir '05-video\upload-meta.json'
    if (Test-Path -LiteralPath $meta) {
      $m = Get-Content -LiteralPath $meta -Raw | ConvertFrom-Json
      $script:txtTitle.Text = $m.title
      $script:txtDesc.Text = $m.description
      Write-Log 'Deskripsi selesai. Edit seperlunya, lanjut ke tab Upload.' $C.Green
      Show-Page $tabUpload
    }
  } | Out-Null
}
New-Lbl $tabDeskripsi 'Judul video' 54 100 660 20 $C.Muted | Out-Null
$script:txtTitle = New-Txt $tabDeskripsi 54 122 660 28 $false
New-Lbl $tabDeskripsi 'Deskripsi (boleh diedit)' 54 156 660 20 $C.Muted | Out-Null
$script:txtDesc = New-Txt $tabDeskripsi 54 178 660 190 $true

$tabUpload = New-Tab '5. Upload'
Step-Label $tabUpload '1' 'Pilih mode upload.' 16
$cbMode = New-Object System.Windows.Forms.ComboBox
$cbMode.Location = New-Object System.Drawing.Point(54, 52)
$cbMode.Size = New-Object System.Drawing.Size(420, 28)
$cbMode.DropDownStyle = 'DropDownList'
$cbMode.Font = $FontUI
Style-Input $cbMode
[void]$cbMode.Items.Add('Otomatis — upload + jadwal dari aplikasi')
[void]$cbMode.Items.Add('Manual — via YouTube Studio (tanpa Google Cloud)')
$cbMode.SelectedIndex = 0
[void]$tabUpload.Controls.Add($cbMode)
$cbMode.add_SelectedIndexChanged({
  $man = $script:cbMode.SelectedIndex -eq 1
  $script:grpAuto.Visible = -not $man
  $script:grpManual.Visible = $man
})

$script:grpAuto = New-Object System.Windows.Forms.Panel
$script:grpAuto.Location = New-Object System.Drawing.Point(16, 92)
$script:grpAuto.Size = New-Object System.Drawing.Size(720, 280)
[void]$tabUpload.Controls.Add($script:grpAuto)
Step-Label $script:grpAuto '2' 'Upload ke akun terpilih, atur privasi & jadwal tayang.' 0
New-Lbl $script:grpAuto 'Video' 38 36 660 20 $C.Muted | Out-Null
$txtVideo = New-Txt $script:grpAuto 38 58 520 28 $false
$txtVideo.ReadOnly = $true
$btnBrowseVideo = New-Btn $script:grpAuto 'Cari...' 568 56 90 32 $C.Blue {
  $d = New-Object System.Windows.Forms.OpenFileDialog
  $d.Filter = 'Video (*.mp4)|*.mp4'
  $d.InitialDirectory = (Join-Path $AgentDir '05-video')
  if ($d.ShowDialog() -eq 'OK') { $script:txtVideo.Text = $d.FileName; $state.VideoFile = $d.FileName }
}
Step-Label $script:grpAuto '3' 'Privasi & jadwal (opsional).' 96
$cbPrivacy = New-Object System.Windows.Forms.ComboBox
$cbPrivacy.Location = New-Object System.Drawing.Point(38, 132)
$cbPrivacy.Size = New-Object System.Drawing.Size(200, 28)
$cbPrivacy.DropDownStyle = 'DropDownList'
$cbPrivacy.Font = $FontUI
Style-Input $cbPrivacy
[void]$cbPrivacy.Items.Add('unlisted — link saja')
[void]$cbPrivacy.Items.Add('private — hanya saya')
[void]$cbPrivacy.Items.Add('public — publik')
$cbPrivacy.SelectedIndex = 0
$cbPrivacy.DropDownWidth = 300
[void]$script:grpAuto.Controls.Add($cbPrivacy)
$chkSchedule = New-Object System.Windows.Forms.CheckBox
$chkSchedule.Text = 'Jadwalkan tayang'
$chkSchedule.Font = $FontUI
$chkSchedule.ForeColor = $C.Text
$chkSchedule.Location = New-Object System.Drawing.Point(254, 134)
$chkSchedule.Size = New-Object System.Drawing.Size(150, 24)
[void]$script:grpAuto.Controls.Add($chkSchedule)
$dtSchedule = New-Object System.Windows.Forms.DateTimePicker
$dtSchedule.Format = 'Custom'
$dtSchedule.CustomFormat = 'dd-MM-yyyy HH:mm'
$dtSchedule.Font = $FontUI
$dtSchedule.Location = New-Object System.Drawing.Point(408, 132)
$dtSchedule.Size = New-Object System.Drawing.Size(170, 28)
$dtSchedule.Value = (Get-Date).AddDays(1)
[void]$script:grpAuto.Controls.Add($dtSchedule)
New-Lbl $script:grpAuto 'Jadwal otomatis memaksa private sampai waktunya tiba.' 38 164 660 20 $C.Muted | Out-Null
$btnUpload = New-Btn $script:grpAuto 'Upload ke YouTube' 38 194 660 44 $C.Red {
  $vf = $script:txtVideo.Text.Trim()
  if (-not $vf) { $vf = $state.VideoFile }
  if (-not $vf -or -not (Test-Path -LiteralPath $vf)) { [System.Windows.Forms.MessageBox]::Show('Belum ada video. Rakit dulu atau pilih file.'); return }
  $state.VideoFile = $vf
  $a = $script:cbAccount.SelectedItem
  if (-not $a) { return }
  if (-not $a.Connected) { [System.Windows.Forms.MessageBox]::Show('Akun belum terhubung. Buka menu 1 dulu.'); Show-Page $tabAkun; return }
  $title = $script:txtTitle.Text.Trim()
  if (-not $title) { [System.Windows.Forms.MessageBox]::Show('Isi judul dulu di menu Deskripsi.'); Show-Page $tabDeskripsi; return }
  $priv = @('unlisted', 'private', 'public')[$script:cbPrivacy.SelectedIndex]
  $cmd = @('run.js', 'youtube', 'upload', '--video', $vf, '--title', $title, '--privacy', $priv)
  if ($script:txtDesc.Text.Trim()) { $cmd += @('--description', $script:txtDesc.Text) }
  if ($a.Key -ne 'default') { $cmd += @('--account', $a.Key) }
  if ($script:chkSchedule.Checked) {
    $cmd += @('--publish-at', (Get-Date $script:dtSchedule.Value).ToString('yyyy-MM-ddTHH:mm:sszzz'))
  }
  $thp = Stage-Thumb
  if ($thp) { $cmd += @('--thumbnail', $thp) }
  Run-Node $cmd 'Upload YouTube' {
    Write-Log 'Upload selesai, cek link di log atas.' $C.Green
    [System.Windows.Forms.MessageBox]::Show('Upload selesai. Cek link di log bawah.')
  } | Out-Null
}

$script:lblThumbStat = New-Lbl $script:grpAuto 'Thumbnail: -' 38 244 400 22 $C.Muted
$btnThumbView = New-Btn $script:grpAuto 'Lihat' 450 242 90 28 $C.Blue {
  $tp = Stage-Thumb
  if ($tp) { Start-Process $tp } else { [System.Windows.Forms.MessageBox]::Show('Belum ada thumbnail di stage.') }
}

function Stage-Thumb {
  if ($state.StageDir) {
    $tp = Join-Path $state.StageDir '05-video\thumbnail.jpg'
    if (Test-Path -LiteralPath $tp) { return $tp }
  }
  return $null
}

function Update-ThumbStat {
  $tp = Stage-Thumb
  if ($tp) { $script:lblThumbStat.Text = 'Thumbnail: ada (ikut terupload)'; $script:lblThumbStat.ForeColor = $C.Green }
  else { $script:lblThumbStat.Text = 'Thumbnail: -'; $script:lblThumbStat.ForeColor = $C.Muted }
}
$script:grpManual = New-Object System.Windows.Forms.Panel
$script:grpManual.Location = New-Object System.Drawing.Point(16, 92)
$script:grpManual.Size = New-Object System.Drawing.Size(720, 280)
$script:grpManual.Visible = $false
[void]$tabUpload.Controls.Add($script:grpManual)
Step-Label $script:grpManual '2' 'Upload sendiri via YouTube Studio (4 klik).' 0
$btnManFolder = New-Btn $script:grpManual '1. Buka Folder Hasil Video' 38 38 660 38 $C.Blue {
  $vd = Join-Path $AgentDir '05-video'
  if (-not (Test-Path -LiteralPath $vd)) { New-Item -ItemType Directory -Path $vd -Force | Out-Null }
  Start-Process $vd
  Write-Log 'Folder hasil dibuka. Ingat nama file videonya.'
}
$btnManTitle = New-Btn $script:grpManual '2. Salin Judul' 38 82 660 38 $C.Blue {
  if (-not $script:txtTitle.Text.Trim()) { [System.Windows.Forms.MessageBox]::Show('Judul kosong. Buat dulu di tab 4.'); return }
  [System.Windows.Forms.Clipboard]::SetText($script:txtTitle.Text)
  Write-Log 'Judul tersalin. Paste di kolom Title YouTube Studio.' $C.Green
}
$btnManDesc = New-Btn $script:grpManual '3. Salin Deskripsi' 38 126 660 38 $C.Blue {
  if (-not $script:txtDesc.Text.Trim()) { [System.Windows.Forms.MessageBox]::Show('Deskripsi kosong. Buat dulu di tab 4.'); return }
  [System.Windows.Forms.Clipboard]::SetText($script:txtDesc.Text)
  Write-Log 'Deskripsi tersalin. Paste di kolom Description YouTube Studio.' $C.Green
}
$btnManStudio = New-Btn $script:grpManual '4. Buka YouTube Studio' 38 170 660 38 $C.Red {
  Start-Process 'https://studio.youtube.com'
  Write-Log 'YouTube Studio dibuka. Klik Create > Upload videos, lalu paste judul & deskripsi.' $C.Green
  Write-Log 'Jadwal tayang & visibilitas diatur langsung di YouTube Studio.' $C.Muted
}

$tabVideos = New-Tab '6. Video Tayang'
Step-Label $tabVideos '1' 'Lihat video yang sudah ada di channel akun terpilih.' 16
$btnLoadVideos = New-Btn $tabVideos 'Muat Daftar Video' 54 52 240 36 $C.Blue {
  $a = $script:cbAccount.SelectedItem
  if (-not $a) { return }
  if (-not $a.Connected) { [System.Windows.Forms.MessageBox]::Show('Hubungkan akun dulu di menu 1.'); return }
  $aa = @()
  if ($a.Key -ne 'default') { $aa = @('--account', $a.Key) }
  Run-Node (@('run.js', 'youtube', 'videos', '--max', '25') + $aa) 'Daftar video tayang' {
    $raw = Get-Content -LiteralPath $state.LogFile -Raw -ErrorAction SilentlyContinue
    if ($raw) {
      $lines = ($raw -split "`r?`n") | Where-Object { $_ -and ($_ -notmatch '^\[\d{2}:\d{2}:\d{2}\]') }
      $script:txtVideosList.Text = ($lines -join "`r`n").Trim()
    }
  } | Out-Null
}
New-Lbl $tabVideos 'Klik link untuk membuka videonya.' 304 60 400 24 $C.Muted | Out-Null
$script:txtVideosList = New-Object System.Windows.Forms.RichTextBox
$script:txtVideosList.Location = New-Object System.Drawing.Point(54, 100)
$script:txtVideosList.Size = New-Object System.Drawing.Size(660, 300)
$script:txtVideosList.ReadOnly = $true
$script:txtVideosList.DetectUrls = $true
$script:txtVideosList.Font = $FontUI
$script:txtVideosList.BackColor = $C.Input
$script:txtVideosList.ForeColor = $C.Text
$script:txtVideosList.BorderStyle = 'None'
[void]$tabVideos.Controls.Add($script:txtVideosList)

New-NavBtn '1. Akun YouTube' $tabAkun 44 | Out-Null
New-NavBtn '2. Buat Materi' $tabMateri 114 | Out-Null
New-NavBtn '3. Paket ZIP' $tabPaket 184 | Out-Null
New-NavBtn '4. Deskripsi' $tabDeskripsi 254 | Out-Null
New-NavBtn '5. Upload' $tabUpload 324 | Out-Null
New-NavBtn '6. Video Tayang' $tabVideos 394 | Out-Null
Show-Page $tabAkun

$script:logBox = New-Object System.Windows.Forms.RichTextBox
$script:logBox.Dock = 'Bottom'
$script:logBox.Height = 170
$script:logBox.ReadOnly = $true
$script:logBox.Font = $FontMono
$script:logBox.BackColor = [System.Drawing.Color]::FromArgb(10, 12, 20)
$script:logBox.ForeColor = [System.Drawing.Color]::LightGray
$script:logBox.BorderStyle = 'None'
$form.Controls.Add($script:logBox) | Out-Null

$lblLogHead = New-Object System.Windows.Forms.Label
$lblLogHead.Text = 'LOG AKTIVITAS'
$lblLogHead.Font = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Bold)
$lblLogHead.ForeColor = $C.Muted
$lblLogHead.BackColor = [System.Drawing.Color]::FromArgb(10, 12, 20)
$lblLogHead.Dock = 'Bottom'
$lblLogHead.Height = 20
$lblLogHead.Padding = New-Object System.Windows.Forms.Padding(10, 2, 0, 0)
$form.Controls.Add($lblLogHead) | Out-Null

$state.Timer = New-Object System.Windows.Forms.Timer
$state.Timer.Interval = 600
$state.Timer.add_Tick({
  if ($state.LogFile -and (Test-Path -LiteralPath $state.LogFile)) {
    $content = Get-Content -LiteralPath $state.LogFile -Raw -ErrorAction SilentlyContinue
    if (($null -ne $content) -and ($content.Length -gt $state.LogPos)) {
      $new = $content.Substring($state.LogPos)
      $state.LogPos = $content.Length
      foreach ($line in ($new -split "`r?`n")) {
        if ($line.Trim()) { Write-Log $line }
      }
      if (-not $state.AuthUrl) {
        $m = [regex]::Match($content, 'https?://[^\s''"]+')
        if ($m.Success -and ($m.Value -match 'accounts\.google\.com')) {
          $state.AuthUrl = $m.Value
          try { $script:txtAuthUrl.Text = $m.Value } catch {}
          Start-Process $state.AuthUrl
          Write-Log 'Browser dibuka untuk login Google...' $C.Blue
          Write-Log 'Jika browser tidak terbuka, salin link dari kotak Link login.' $C.Orange
        }
      }
    }
  }
  if ($state.AuthTok -and $state.NodeProc -and -not $state.NodeProc.HasExited -and (Test-Path -LiteralPath $state.AuthTok)) {
    $elapsed = ((Get-Date) - $state.JobStart).TotalSeconds
    if ($elapsed -gt 45) {
      try { $state.NodeProc.Kill() } catch {}
      Write-Log 'Token sudah tersimpan, menyelesaikan proses login...' $C.Green
    }
  }
  if ($state.NodeProc -and $state.NodeProc.HasExited) {
    $cb = $state.OnDone
    $state.OnDone = $null
    $state.NodeProc = $null
    $state.Timer.Stop()
    $state.AuthUrl = ''
    $state.AuthTok = ''
    $ef = $state.LogFile + '.err'
    if (Test-Path -LiteralPath $ef) {
      $ec = Get-Content -LiteralPath $ef -Raw -ErrorAction SilentlyContinue
      if ($ec) {
        foreach ($line in ($ec -split "`r?`n")) {
          if ($line.Trim()) { Write-Log $line }
        }
      }
    }
    if ($cb) { try { & $cb } catch { Write-Log ('Error lanjutan: ' + $_.Exception.Message) $C.Red } }
    try { Refresh-Accounts } catch { Write-Log ('Error refresh: ' + $_.Exception.Message) $C.Red }
  }
})

$form.Controls.SetChildIndex($content, 0)
$form.add_Shown({ Refresh-Accounts; Write-Log 'Viral Video Studio siap. Mulai dari tab 1: hubungkan akun YouTube.' })
$form.add_FormClosing({
  $state.Timer.Stop()
  if ($state.NodeProc -and -not $state.NodeProc.HasExited) { try { $state.NodeProc.Kill() } catch {} }
})
[void]$form.ShowDialog()
