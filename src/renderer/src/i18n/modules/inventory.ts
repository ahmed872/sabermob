export const inventory = {
  en: {
    inventory: {
      title: 'Inventory', subtitle: 'Products, stock and categories', products: 'Products', stock: 'Stock movements', setup: 'Categories & brands',
      newProduct: 'New product', editProduct: 'Edit product', productName: 'Product name', altName: 'Name in other language', altNameHint: 'Helps search in Arabic and English',
      productType: 'What are you adding?', category: 'Category', brand: 'Brand', model: 'Phone model', compatibleModel: 'For phone model', supplier: 'Default supplier',
      sellPrice: 'Selling price', costPrice: 'Cost price', minPrice: 'Minimum price', wholesalePrice: 'Wholesale price', stockQty: 'In stock', minStock: 'Alert when below',
      maxStock: 'Maximum stock', openingStock: 'Opening quantity', barcode: 'Barcode', barcodes: 'Barcodes', addBarcode: 'Add barcode', generateBarcode: 'Generate',
      sku: 'Item code (SKU)', warranty: 'Warranty (days)', trackStock: 'Track stock quantity', trackSerials: 'Track each unit by IMEI / serial', serials: 'IMEI / serial numbers',
      serialsHint: 'One per line — the count becomes the opening quantity', tax: 'Tax rate', taxDefault: 'Default ({{rate}})', favorite: 'Show in POS favorites',
      variants: 'Variants', variantsHint: 'Use variants for colors / sizes / storage that share one product', addVariant: 'Add variant', variantName: 'Variant',
      color: 'Color', material: 'Material', size: 'Size', storage: 'Storage', ram: 'RAM', advanced: 'More details', notes: 'Notes', active: 'Available for sale',
      margin: 'Margin', profitPerUnit: 'Profit / unit', priceBelowCost: 'Selling price is below cost', saved: 'Product saved', deleted: 'Product deleted',
      deleteConfirm: 'Delete “{{name}}”? Sales history is kept.', noProducts: 'No products yet', noProductsBody: 'Add your first product or import a list from Excel.',
      filters: { all: 'All', low: 'Low stock', out: 'Out of stock', over: 'Overstock', dead: 'Not selling', favorites: 'Favorites' },
      sort: { name: 'Name', stock: 'Lowest stock', price: 'Highest price', recent: 'Newest' },
      allCategories: 'All categories', allBrands: 'All brands', allTypes: 'All types', units: '{{count}} units',
      types: { ACCESSORY: 'Accessory', DEVICE: 'New phone', USED_DEVICE: 'Used phone', SERVICE: 'Service', PART: 'Spare part', CUSTOM: 'Other' },
      typeHints: { ACCESSORY: 'Cases, chargers, cables…', DEVICE: 'New phones & tablets', USED_DEVICE: 'Second-hand devices', SERVICE: 'Repairs & services (no stock)', PART: 'Screens, batteries…', CUSTOM: 'Anything else' },
      adjust: 'Adjust stock', adjustTitle: 'Stock adjustment', adjustType: 'Reason', counted: 'Counted quantity', quantity: 'Quantity', adjustDone: 'Stock updated ({{number}})',
      adjustTypes: { COUNT: 'Stock count', DAMAGED: 'Damaged', LOST: 'Lost / missing', CORRECTION: 'Correction (+/−)', OPENING: 'Opening stock' },
      movementTypes: {
        OPENING: 'Opening', PURCHASE: 'Purchase', SALE: 'Sale', SALE_RETURN: 'Customer return', PURCHASE_RETURN: 'Returned to supplier', ADJUSTMENT: 'Count',
        DAMAGED: 'Damaged', LOST: 'Lost', REPAIR_USE: 'Used in repair', REPAIR_RETURN: 'Returned from repair', CORRECTION: 'Correction'
      },
      balance: 'Balance', history: 'Stock history', valuation: 'Stock value', costValue: 'At cost', retailValue: 'At selling price', skuCount: 'Items',
      categories: 'Categories', brands: 'Brands', models: 'Phone models', newCategory: 'New category', newBrand: 'New brand', newModel: 'New model',
      categoryKind: 'Kind', kinds: { ACCESSORY: 'Accessories', DEVICE: 'Devices', SERVICE: 'Services', PART: 'Spare parts', OTHER: 'Other' },
      aliases: 'Other names / codes', aliasesHint: 'e.g. SM-A556, A55 5G — used by search', selectBrand: 'Select a brand to see its models',
      productsCount: '{{count}} products', modelsCount: '{{count}} models', printLabels: 'Print labels', openPrice: 'Price is entered at sale time when 0',
      import: 'Import', exportList: 'Export', alerts: { low: '{{count}} products are running low', out: '{{count}} out of stock', dead: '{{count}} not selling for a long time' },
      notFoundAdd: 'Product not found. Add a new product?', serialsCount: '{{count}} units with IMEI in stock'
    }
  },
  ar: {
    inventory: {
      title: 'المخزن', subtitle: 'الأصناف والكميات والأقسام', products: 'الأصناف', stock: 'حركة المخزون', setup: 'الأقسام والماركات',
      newProduct: 'صنف جديد', editProduct: 'تعديل صنف', productName: 'اسم الصنف', altName: 'الاسم باللغة الأخرى', altNameHint: 'يساعد في البحث بالعربي والإنجليزي',
      productType: 'إيه اللي بتضيفه؟', category: 'القسم', brand: 'الماركة', model: 'موديل الموبايل', compatibleModel: 'لموديل', supplier: 'المورد الافتراضي',
      sellPrice: 'سعر البيع', costPrice: 'سعر التكلفة', minPrice: 'أقل سعر بيع', wholesalePrice: 'سعر الجملة', stockQty: 'الكمية بالمخزن', minStock: 'تنبيه عند أقل من',
      maxStock: 'أقصى كمية', openingStock: 'الكمية الافتتاحية', barcode: 'الباركود', barcodes: 'الباركودات', addBarcode: 'إضافة باركود', generateBarcode: 'توليد',
      sku: 'كود الصنف', warranty: 'الضمان (أيام)', trackStock: 'متابعة الكمية بالمخزن', trackSerials: 'متابعة كل قطعة برقم IMEI / سيريال', serials: 'أرقام IMEI / السيريال',
      serialsHint: 'رقم في كل سطر — العدد يصبح الكمية الافتتاحية', tax: 'نسبة الضريبة', taxDefault: 'الافتراضي ({{rate}})', favorite: 'إظهار في مفضلة الكاشير',
      variants: 'الأنواع', variantsHint: 'استخدم الأنواع للألوان / المقاسات / المساحات لنفس الصنف', addVariant: 'إضافة نوع', variantName: 'النوع',
      color: 'اللون', material: 'الخامة', size: 'المقاس', storage: 'المساحة', ram: 'الرام', advanced: 'تفاصيل إضافية', notes: 'ملاحظات', active: 'متاح للبيع',
      margin: 'هامش الربح', profitPerUnit: 'الربح / القطعة', priceBelowCost: 'سعر البيع أقل من التكلفة', saved: 'تم حفظ الصنف', deleted: 'تم حذف الصنف',
      deleteConfirm: 'حذف «{{name}}»؟ سجل المبيعات سيبقى محفوظاً.', noProducts: 'لا توجد أصناف بعد', noProductsBody: 'أضف أول صنف أو استورد قائمة من Excel.',
      filters: { all: 'الكل', low: 'كمية قليلة', out: 'نفد', over: 'زيادة', dead: 'راكد', favorites: 'المفضلة' },
      sort: { name: 'الاسم', stock: 'الأقل كمية', price: 'الأعلى سعراً', recent: 'الأحدث' },
      allCategories: 'كل الأقسام', allBrands: 'كل الماركات', allTypes: 'كل الأنواع', units: '{{count}} قطعة',
      types: { ACCESSORY: 'إكسسوار', DEVICE: 'موبايل جديد', USED_DEVICE: 'موبايل مستعمل', SERVICE: 'خدمة', PART: 'قطعة غيار', CUSTOM: 'أخرى' },
      typeHints: { ACCESSORY: 'جرابات، شواحن، كابلات…', DEVICE: 'موبايلات وتابلت جديدة', USED_DEVICE: 'أجهزة مستعملة', SERVICE: 'صيانة وخدمات (بدون مخزون)', PART: 'شاشات، بطاريات…', CUSTOM: 'أي شيء آخر' },
      adjust: 'تسوية المخزون', adjustTitle: 'تسوية مخزون', adjustType: 'السبب', counted: 'الكمية الفعلية', quantity: 'الكمية', adjustDone: 'تم تحديث المخزون ({{number}})',
      adjustTypes: { COUNT: 'جرد', DAMAGED: 'تالف', LOST: 'فاقد / مفقود', CORRECTION: 'تصحيح (+/−)', OPENING: 'رصيد افتتاحي' },
      movementTypes: {
        OPENING: 'رصيد افتتاحي', PURCHASE: 'شراء', SALE: 'بيع', SALE_RETURN: 'مرتجع عميل', PURCHASE_RETURN: 'مرتجع للمورد', ADJUSTMENT: 'جرد',
        DAMAGED: 'تالف', LOST: 'فاقد', REPAIR_USE: 'استخدام في صيانة', REPAIR_RETURN: 'إرجاع من صيانة', CORRECTION: 'تصحيح'
      },
      balance: 'الرصيد', history: 'سجل الحركة', valuation: 'قيمة المخزون', costValue: 'بالتكلفة', retailValue: 'بسعر البيع', skuCount: 'الأصناف',
      categories: 'الأقسام', brands: 'الماركات', models: 'موديلات الموبايل', newCategory: 'قسم جديد', newBrand: 'ماركة جديدة', newModel: 'موديل جديد',
      categoryKind: 'النوع', kinds: { ACCESSORY: 'إكسسوارات', DEVICE: 'أجهزة', SERVICE: 'خدمات', PART: 'قطع غيار', OTHER: 'أخرى' },
      aliases: 'أسماء / أكواد أخرى', aliasesHint: 'مثال: SM-A556, A55 5G — تُستخدم في البحث', selectBrand: 'اختر ماركة لعرض موديلاتها',
      productsCount: '{{count}} صنف', modelsCount: '{{count}} موديل', printLabels: 'طباعة ملصقات', openPrice: 'لو السعر 0 يتم إدخاله وقت البيع',
      import: 'استيراد', exportList: 'تصدير', alerts: { low: '{{count}} صنف قرب يخلص', out: '{{count}} صنف نفد', dead: '{{count}} صنف راكد من فترة' },
      notFoundAdd: 'الصنف غير موجود. إضافة صنف جديد؟', serialsCount: '{{count}} قطعة بـ IMEI في المخزن'
    }
  }
}
