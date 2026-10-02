export const offers = {
  en: {
    offers: {
      title: 'Smart offers', subtitle: 'Bundles, cross-sells and automatic discounts', newOffer: 'New offer', editOffer: 'Edit offer', suggestion: 'Smart suggestion',
      add: 'Add', ignore: 'Ignore', regular: 'Regular', offerPrice: 'Offer', boughtTogether: 'Often bought together', analytics: 'Results', offersTab: 'Offers',
      types: {
        CROSS_SELL: 'Add-on suggestion', BUNDLE: 'Bundle price', CART_THRESHOLD: 'Spend & get', CLEARANCE: 'Clearance', PERCENT: '% off (automatic)',
        FIXED: 'Amount off (automatic)', QTY_DISCOUNT: 'Quantity discount', BUY_X_GET_Y: 'Buy X get Y free'
      },
      typeHints: {
        CROSS_SELL: 'When the customer buys A, suggest B at a discount', BUNDLE: 'When A is in the cart, offer B at a special price',
        CART_THRESHOLD: 'When the cart reaches an amount, suggest a product at a special price', CLEARANCE: 'Push slow-moving stock with a discount',
        PERCENT: 'Applies automatically to chosen products', FIXED: 'Fixed amount off chosen products', QTY_DISCOUNT: 'Discount when buying several pieces',
        BUY_X_GET_Y: 'e.g. buy 2 get 1 free'
      },
      when: 'When the cart has', whenHint: 'Leave empty for any cart', offerOn: 'Offer applies to', discountPercent: 'Discount %', discountAmount: 'Discount amount',
      bundlePrice: 'Special price', buyQty: 'Buy', getQty: 'Get free', minQty: 'Minimum quantity', minCartTotal: 'Cart total at least', customerType: 'Only for',
      anyCustomer: 'All customers', startsAt: 'Starts', endsAt: 'Ends', maxUses: 'Max uses', priority: 'Priority', autoApply: 'Apply automatically (no cashier action)',
      active: 'Active', products: 'Products', categories: 'Categories', shown: 'Shown', accepted: 'Accepted', converted: 'Sold', conversion: 'Conversion', revenue: 'Revenue',
      discountCost: 'Discount given', profit: 'Profit', noOffers: 'No offers yet', noOffersBody: 'Create your first offer — e.g. screen protector 20% off with any case.',
      deadStock: '{{count}} products are not selling (stock value {{value}})', createClearance: 'Create clearance offer', uses: '{{count}} uses',
      safety: 'Offers never go below the minimum price or your margin floor (Settings → Smart offers).', sources: { OFFER: 'Offer', AFFINITY: 'Bought together', CLEARANCE: 'Clearance', THRESHOLD: 'Spend & get' },
      days: 'Days', allDays: 'Every day', weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    }
  },
  ar: {
    offers: {
      title: 'العروض الذكية', subtitle: 'باقات واقتراحات وخصومات تلقائية', newOffer: 'عرض جديد', editOffer: 'تعديل عرض', suggestion: 'اقتراح ذكي',
      add: 'إضافة', ignore: 'تجاهل', regular: 'السعر', offerPrice: 'العرض', boughtTogether: 'بيتشتري معاه غالباً', analytics: 'النتائج', offersTab: 'العروض',
      types: {
        CROSS_SELL: 'اقتراح إضافي', BUNDLE: 'سعر باقة', CART_THRESHOLD: 'اشتري بمبلغ واحصل', CLEARANCE: 'تصفية', PERCENT: 'خصم % (تلقائي)',
        FIXED: 'خصم مبلغ (تلقائي)', QTY_DISCOUNT: 'خصم الكمية', BUY_X_GET_Y: 'اشتري X وخد Y مجاناً'
      },
      typeHints: {
        CROSS_SELL: 'لما العميل يشتري أ، اقترح ب بخصم', BUNDLE: 'لما أ يكون في السلة، اعرض ب بسعر خاص',
        CART_THRESHOLD: 'لما الفاتورة توصل مبلغ معين، اقترح صنف بسعر خاص', CLEARANCE: 'تصريف البضاعة الراكدة بخصم',
        PERCENT: 'يتطبق تلقائياً على الأصناف المختارة', FIXED: 'مبلغ ثابت خصم على الأصناف', QTY_DISCOUNT: 'خصم عند شراء أكثر من قطعة',
        BUY_X_GET_Y: 'مثال: اشتري 2 وخد 1 مجاناً'
      },
      when: 'لما السلة فيها', whenHint: 'اتركه فارغاً لأي سلة', offerOn: 'العرض على', discountPercent: 'نسبة الخصم %', discountAmount: 'مبلغ الخصم',
      bundlePrice: 'السعر الخاص', buyQty: 'اشتري', getQty: 'مجاناً', minQty: 'أقل كمية', minCartTotal: 'إجمالي الفاتورة على الأقل', customerType: 'فقط لـ',
      anyCustomer: 'كل العملاء', startsAt: 'يبدأ', endsAt: 'ينتهي', maxUses: 'أقصى عدد مرات', priority: 'الأولوية', autoApply: 'يتطبق تلقائياً (بدون تدخل الكاشير)',
      active: 'نشط', products: 'أصناف', categories: 'أقسام', shown: 'ظهر', accepted: 'اتقبل', converted: 'اتباع', conversion: 'نسبة القبول', revenue: 'الإيراد',
      discountCost: 'قيمة الخصم', profit: 'الربح', noOffers: 'لا توجد عروض بعد', noOffersBody: 'اعمل أول عرض — مثلاً: اسكرينة بخصم 20% مع أي جراب.',
      deadStock: '{{count}} صنف راكد (قيمة المخزون {{value}})', createClearance: 'عمل عرض تصفية', uses: '{{count}} مرة',
      safety: 'العروض لا تنزل أبداً عن أقل سعر أو أقل هامش ربح (الإعدادات ← العروض الذكية).', sources: { OFFER: 'عرض', AFFINITY: 'بيتشتري معاه', CLEARANCE: 'تصفية', THRESHOLD: 'اشتري واحصل' },
      days: 'الأيام', allDays: 'كل الأيام', weekdays: ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
    }
  }
}
