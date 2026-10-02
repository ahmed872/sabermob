export const permissions = {
  en: {
    permissionGroups: { sales: 'Sales', finance: 'Profit & reports', inventory: 'Inventory', suppliers: 'Suppliers', repairs: 'Repairs', customers: 'Customers', offers: 'Offers', admin: 'Administration' },
    permissions: {
      view_sales: 'View sales', create_sale: 'Make sales', cancel_sale: 'Void sales', refund_sale: 'Refund / return', edit_price: 'Change prices at checkout',
      apply_discount: 'Give discounts', sell_below_min_price: 'Sell below minimum price', sell_on_credit: 'Sell on credit (debt)', reprint_receipt: 'Reprint receipts',
      manage_shifts: 'Open/close own shift', view_all_shifts: 'Review all shifts', manage_cash_drawer: 'Cash in/out of drawer',
      view_profit: 'View profit', view_cost: 'View cost prices', view_reports: 'View reports', export_reports: 'Export reports',
      view_inventory: 'View inventory', manage_inventory: 'Add/edit products', modify_stock: 'Adjust stock', import_data: 'Import data',
      manage_suppliers: 'Manage suppliers', manage_purchases: 'Purchases & receiving', pay_suppliers: 'Pay suppliers', view_supplier_balances: 'View supplier balances',
      view_repairs: 'View repairs', manage_repairs: 'Create/update repairs', delete_repair: 'Delete repairs', view_device_passcode: 'See device passcodes',
      view_customer_data: 'View customers', manage_customers: 'Add/edit customers', collect_customer_debt: 'Collect customer debt',
      manage_offers: 'Manage offers', view_offer_analytics: 'Offer analytics',
      manage_users: 'Manage users & roles', manage_settings: 'Change settings', manage_backups: 'Backups & restore', view_audit_log: 'View activity log', manage_license: 'Activation & license'
    },
    roles: { OWNER: 'Owner', MANAGER: 'Manager', CASHIER: 'Cashier', TECHNICIAN: 'Technician', ACCOUNTANT: 'Accountant', INVENTORY_MANAGER: 'Inventory manager' }
  },
  ar: {
    permissionGroups: { sales: 'المبيعات', finance: 'الأرباح والتقارير', inventory: 'المخزن', suppliers: 'الموردين', repairs: 'الصيانة', customers: 'العملاء', offers: 'العروض', admin: 'الإدارة' },
    permissions: {
      view_sales: 'عرض المبيعات', create_sale: 'البيع', cancel_sale: 'إلغاء فاتورة', refund_sale: 'مرتجع / استرداد', edit_price: 'تعديل السعر عند البيع',
      apply_discount: 'عمل خصم', sell_below_min_price: 'البيع بأقل من الحد الأدنى', sell_on_credit: 'البيع بالآجل', reprint_receipt: 'إعادة طباعة الإيصال',
      manage_shifts: 'فتح/قفل الوردية', view_all_shifts: 'مراجعة كل الورديات', manage_cash_drawer: 'إيداع/سحب من الدرج',
      view_profit: 'عرض الأرباح', view_cost: 'عرض سعر التكلفة', view_reports: 'عرض التقارير', export_reports: 'تصدير التقارير',
      view_inventory: 'عرض المخزن', manage_inventory: 'إضافة/تعديل الأصناف', modify_stock: 'تسوية المخزون', import_data: 'استيراد البيانات',
      manage_suppliers: 'إدارة الموردين', manage_purchases: 'المشتريات والاستلام', pay_suppliers: 'الدفع للموردين', view_supplier_balances: 'عرض أرصدة الموردين',
      view_repairs: 'عرض الصيانة', manage_repairs: 'إنشاء/تحديث الصيانة', delete_repair: 'حذف تذكرة صيانة', view_device_passcode: 'رؤية رمز قفل الجهاز',
      view_customer_data: 'عرض العملاء', manage_customers: 'إضافة/تعديل العملاء', collect_customer_debt: 'تحصيل مديونية العملاء',
      manage_offers: 'إدارة العروض', view_offer_analytics: 'تحليلات العروض',
      manage_users: 'إدارة المستخدمين والصلاحيات', manage_settings: 'تعديل الإعدادات', manage_backups: 'النسخ الاحتياطي والاسترجاع', view_audit_log: 'سجل النشاط', manage_license: 'التفعيل والترخيص'
    },
    roles: { OWNER: 'المالك', MANAGER: 'مدير', CASHIER: 'كاشير', TECHNICIAN: 'فني صيانة', ACCOUNTANT: 'محاسب', INVENTORY_MANAGER: 'مسؤول المخزن' }
  }
}
