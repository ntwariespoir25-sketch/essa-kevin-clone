$f = "frontend\src\Portals\AccountsAdminDashboard.jsx"
$g = Get-Content $f
$names = @(
  'const generateInvoices = async',
  'const updateInvoiceStatus = async',
  'const openInvoiceDetail = async',
  'const openInvoiceModal = ',           # generate modal opener
  'const setInvoiceDetail = ',           # (avoid - this is the setter)
  'const fetchInvoiceDetail = ',
  'const fetchInvoices = ',
  'const fetchFeeAnalytics = ',
  'const fetchAnalytics = ',
  'const fetchFeeAnalyticsData = ',
  'const fetchInvoicesList = ',
  'const fetchInvoiceDetailData = ',
  'const generateInvoicesList = ',
  'const generateFeeInvoices = ',
  'const updateInvoiceStatusFn = ',
  'const printInvoiceDetail = ',
  'const printReceipt = ',
  'const printReceiptFn = ',
  'const openReceipt = ',
  'const viewReceipt = '
)
foreach ($n in $names) {
  $hits = @(Select-String -Path $f -SimpleMatch -Pattern $n)
  if ($hits.Count -gt 0) {
    "{0}x  [{1}]  ::  {2}" -f $hits.Count, $n, (($hits | ForEach-Object { $_.LineNumber }) -join ', ')
  } else {
    " 0x  [{0}]" -f $n
  }
}
