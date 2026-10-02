export const reports = {
  en: {
    dashboard: {
      title: 'Dashboard', greeting: 'Good day, {{name}}', todaySales: "Today's sales", todayProfit: "Today's profit", pendingRepairs: 'Repairs in progress',
      lowStock: 'Running low', supplierDebt: 'We owe suppliers', customerDebt: 'Customers owe us', vsYesterday: 'Yesterday {{amount}}', salesCount: '{{count}} sales',
      trend: 'Sales — last 14 days', topProducts: 'Top products (30 days)', repairsList: 'Repairs needing attention', alerts: 'Smart alerts', technicians: 'Technicians',
      openRepairs: '{{count}} open', alertLow: '{{count}} products are running low', alertOut: '{{count}} products are out of stock', alertDead: '{{count}} products are not selling',
      alertOverdue: '{{count}} repairs are overdue', alertReady: '{{count}} devices are ready for pickup', alertShift: '{{count}} closed shifts have a cash difference',
      allGood: 'Everything looks good', topOffers: 'Best offers (30 days)', sales: 'Sales', profit: 'Profit', quick: { sale: 'New sale', repair: 'Receive device', product: 'Add product', purchase: 'Purchase' }
    },
    reports: {
      title: 'Reports', subtitle: 'Sales, profit, stock, repairs and people', range: 'Period', group: 'Group by', groups: { day: 'Day', week: 'Week', month: 'Month', year: 'Year' },
      ranges: { today: 'Today', week: 'Last 7 days', month: 'This month', lastMonth: 'Last month', year: 'This year', custom: 'Custom' },
      tabs: { sales: 'Sales', profit: 'Profit', inventory: 'Inventory', repairs: 'Repairs', suppliers: 'Suppliers', employees: 'Employees' },
      revenue: 'Net sales', count: 'Sales', avgTicket: 'Average sale', tax: 'Tax', discounts: 'Discounts', refunds: 'Returns', cost: 'Cost', profit: 'Profit',
      byMethod: 'By payment method', byCategory: 'By category', topProducts: 'Best-selling products', product: 'Product', qty: 'Qty', period: 'Period',
      productProfit: 'Products profit', serviceProfit: 'Services profit', repairProfit: 'Repairs profit', grossProfit: 'Gross profit', expenses: 'Drawer expenses',
      estimatedNet: 'Estimated net profit', netHint: 'Gross profit minus cash paid out from the drawer', valuation: 'Stock value', units: 'Units', items: 'Items',
      low: 'Running low', dead: 'Not selling', fast: 'Fast moving', slow: 'Slow moving', lastSold: 'Last sold', stock: 'Stock', value: 'Value', minStock: 'Alert level',
      received: 'Received', delivered: 'Delivered', cancelled: 'Cancelled', delayed: 'Delayed', avgDays: 'Avg. days', repairRevenue: 'Repair revenue', open: 'Open',
      owed: 'We owe', owedToUs: 'Owed to us', purchases: 'Purchases', payments: 'Paid', employee: 'Employee', voids: 'Cancelled', actions: 'Actions',
      export: 'Export', csv: 'CSV', xlsx: 'Excel', pdf: 'PDF', exported: 'Saved: {{path}}', noData: 'No data for this period'
    },
    search: {
      placeholder: 'Search products, customers, phone, repair #, receipt #… or scan a QR', title: 'Search', products: 'Products', customers: 'Customers', repairs: 'Repairs',
      sales: 'Receipts', suppliers: 'Suppliers', scanQr: 'Scan QR', hint: 'Ctrl+K anywhere', empty: 'Type at least 2 characters', noCamera: 'No camera found or access was denied'
    }
  },
  ar: {
    dashboard: {
      title: 'الرئيسية', greeting: 'يومك سعيد يا {{name}}', todaySales: 'مبيعات اليوم', todayProfit: 'ربح اليوم', pendingRepairs: 'صيانة تحت الإصلاح',
      lowStock: 'قرب يخلص', supplierDebt: 'علينا للموردين', customerDebt: 'لنا عند العملاء', vsYesterday: 'أمس {{amount}}', salesCount: '{{count}} عملية',
      trend: 'المبيعات — آخر 14 يوم', topProducts: 'الأكثر مبيعاً (30 يوم)', repairsList: 'صيانة محتاجة متابعة', alerts: 'تنبيهات ذكية', technicians: 'الفنيين',
      openRepairs: '{{count}} مفتوح', alertLow: '{{count}} صنف قرب يخلص', alertOut: '{{count}} صنف نفد من المخزن', alertDead: '{{count}} صنف راكد مش بيتباع',
      alertOverdue: '{{count}} جهاز صيانة متأخر', alertReady: '{{count}} جهاز جاهز للتسليم', alertShift: '{{count}} وردية مقفولة فيها فرق نقدية',
      allGood: 'كل شيء تمام', topOffers: 'أفضل العروض (30 يوم)', sales: 'المبيعات', profit: 'الربح', quick: { sale: 'بيع جديد', repair: 'استلام جهاز', product: 'إضافة صنف', purchase: 'فاتورة شراء' }
    },
    reports: {
      title: 'التقارير', subtitle: 'المبيعات والأرباح والمخزن والصيانة والموظفين', range: 'الفترة', group: 'تجميع حسب', groups: { day: 'يوم', week: 'أسبوع', month: 'شهر', year: 'سنة' },
      ranges: { today: 'اليوم', week: 'آخر 7 أيام', month: 'هذا الشهر', lastMonth: 'الشهر الماضي', year: 'هذه السنة', custom: 'مخصص' },
      tabs: { sales: 'المبيعات', profit: 'الأرباح', inventory: 'المخزن', repairs: 'الصيانة', suppliers: 'الموردين', employees: 'الموظفين' },
      revenue: 'صافي المبيعات', count: 'عدد العمليات', avgTicket: 'متوسط الفاتورة', tax: 'الضريبة', discounts: 'الخصومات', refunds: 'المرتجعات', cost: 'التكلفة', profit: 'الربح',
      byMethod: 'حسب طريقة الدفع', byCategory: 'حسب القسم', topProducts: 'الأصناف الأكثر مبيعاً', product: 'الصنف', qty: 'الكمية', period: 'الفترة',
      productProfit: 'ربح الأصناف', serviceProfit: 'ربح الخدمات', repairProfit: 'ربح الصيانة', grossProfit: 'إجمالي الربح', expenses: 'مصروفات من الدرج',
      estimatedNet: 'صافي الربح التقديري', netHint: 'إجمالي الربح ناقص المصروفات المدفوعة من الدرج', valuation: 'قيمة المخزون', units: 'قطعة', items: 'صنف',
      low: 'قرب يخلص', dead: 'راكد', fast: 'سريع البيع', slow: 'بطيء البيع', lastSold: 'آخر بيع', stock: 'المخزون', value: 'القيمة', minStock: 'حد التنبيه',
      received: 'مستلم', delivered: 'تم تسليمه', cancelled: 'ملغي', delayed: 'متأخر', avgDays: 'متوسط الأيام', repairRevenue: 'إيراد الصيانة', open: 'مفتوح',
      owed: 'علينا', owedToUs: 'لنا', purchases: 'المشتريات', payments: 'المدفوع', employee: 'الموظف', voids: 'إلغاءات', actions: 'العمليات',
      export: 'تصدير', csv: 'CSV', xlsx: 'Excel', pdf: 'PDF', exported: 'تم الحفظ: {{path}}', noData: 'لا توجد بيانات في هذه الفترة'
    },
    search: {
      placeholder: 'ابحث عن صنف، عميل، موبايل، رقم صيانة، رقم إيصال… أو امسح QR', title: 'بحث', products: 'الأصناف', customers: 'العملاء', repairs: 'الصيانة',
      sales: 'الإيصالات', suppliers: 'الموردين', scanQr: 'مسح QR', hint: 'Ctrl+K من أي مكان', empty: 'اكتب حرفين على الأقل', noCamera: 'لا توجد كاميرا أو تم رفض الوصول إليها'
    }
  }
}
