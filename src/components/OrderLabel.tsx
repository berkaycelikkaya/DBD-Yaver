import React from 'react';
import { cn } from '../lib/utils';

interface Order {
  orderId: string;
  customerName: string;
  fabricCode: string;
  lineDirection: string;
  extraInfo: string;
  dimensions: string;
  createdAt?: string;
}

interface OrderLabelProps {
  order: Order;
  className?: string;
  settings: {
    width: number;
    height: number;
    hideCustomerNames?: boolean;
  };
  onChange?: (fields: Partial<Order>) => void;
}

export const OrderLabel: React.FC<OrderLabelProps> = ({ order, className, settings, onChange }) => {
  // Calculate scale factor based on 100mm reference size
  const scale = Math.min(settings.width, settings.height) / 100;

  // Formatting date into GG/AA/YY (e.g. 18/06/26) format
  const dateStr = React.useMemo(() => {
    if (order.createdAt) return order.createdAt;
    const d = new Date();
    const gg = String(d.getDate()).padStart(2, '0');
    const aa = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${gg}/${aa}/${yy}`;
  }, [order.createdAt]);

  const isUrgent = order.orderId.trim().startsWith('#');
  const isLongFabric = order.fabricCode.length > 12;
  
  return (
    <div 
      className={cn(
        "bg-white text-black flex flex-col border border-gray-200 print:border-0 print:m-0 relative overflow-hidden",
        className
      )}
      style={{ 
        boxSizing: 'border-box',
        width: `${settings.width}mm`,
        height: `${settings.height}mm`,
        fontSize: `${scale * 15}px`,
        padding: `${scale * 1.25}rem`,
      }}
    >
      {/* Subtle Background Pattern */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.02] print:opacity-[0.03]" 
        style={{
          backgroundImage: `radial-gradient(#000 1px, transparent 1px)`,
          backgroundSize: `${scale * 8}px ${scale * 8}px`
        }}
      />

      {/* Content (Relative to stay above pattern) */}
      <div className="relative z-10 flex flex-col h-full w-full overflow-hidden justify-between" style={{ color: '#000000' }}>
        {/* Header */}
        <div>
          <div 
            className="flex justify-between items-center border-b-2"
            style={{ 
              paddingBottom: `${scale * 0.5}rem`,
              borderBottom: `${Math.max(2, scale * 3)}px solid #000000`
            }}
          >
            <div className="flex flex-col min-w-0">
              <h1 className="text-2xl font-black uppercase tracking-tighter truncate leading-none" style={{ color: '#000000' }}>SİPARİŞ FİŞİ</h1>
            </div>
            <div 
              className={cn(
                "px-3 py-1 rounded-lg shrink-0 border-2 flex items-center justify-center",
                isUrgent ? "bg-white text-black border-black" : "bg-black text-white border-black"
              )}
            >
              {onChange ? (
                <input
                  type="text"
                  value={order.orderId}
                  onChange={(e) => onChange({ orderId: e.target.value })}
                  className="bg-transparent border-none font-bold text-center outline-none focus:ring-1 focus:ring-black w-24 text-xl leading-none"
                  style={{ color: isUrgent ? '#000000' : '#ffffff' }}
                />
              ) : (
                <p className="text-xl font-bold" style={{ color: isUrgent ? '#000000' : '#ffffff' }}>{order.orderId}</p>
              )}
            </div>
          </div>

          {/* Urgent Banner if orderId starts with # */}
          {isUrgent && (
            <div 
              className="mt-2.5 bg-white border-2 border-black text-black font-black text-center py-2 rounded-lg tracking-[0.25em] text-xl leading-none animate-pulse"
              style={{
                fontSize: `${scale * 18}px`,
                color: '#000000',
                borderColor: '#000000'
              }}
            >
              ACİL
            </div>
          )}
        </div>

        {/* Main Content Grid - Taller and better spaced for 100x150 mm size */}
        <div className="flex-1 min-h-0 flex flex-col justify-start py-4" style={{ gap: `${scale * 1.25}rem` }}>
          
          {/* Customer Name block - Completely hidden when hideCustomerNames is active */}
          {!settings.hideCustomerNames && (
            <div className="min-w-0 flex flex-col items-start w-full">
              <p className="text-[9px] font-bold uppercase text-black mb-1" style={{ fontSize: `${Math.max(6.5, scale * 8.5)}px`, color: '#000000' }}>Müşteri Adı</p>
              {onChange ? (
                <input
                  type="text"
                  value={order.customerName}
                  onChange={(e) => onChange({ customerName: e.target.value })}
                  className="w-full bg-transparent border-0 border-b-2 border-black font-bold uppercase text-xl leading-tight pb-1 outline-none focus:bg-black/[0.02] transition-colors"
                  style={{ color: '#000000' }}
                  title="Doğrudan düzenlemek için tıklayın"
                />
              ) : (
                <span className="text-xl font-bold uppercase leading-tight break-words line-clamp-1 pb-1 border-b-2 block w-full" style={{ borderBottom: '2px solid #000000', color: '#000000' }}>
                  {order.customerName}
                </span>
              )}
            </div>
          )}

          {/* Fabric Layout Rows */}
          <div className={cn("grid gap-2", isLongFabric ? "grid-cols-1" : "grid-cols-2")} style={{ gap: `${scale * 1}rem` }}>
            <div className="min-w-0 flex flex-col items-start w-full">
              <p className="text-[9px] font-bold uppercase text-black mb-1" style={{ fontSize: `${Math.max(6.5, scale * 8.5)}px`, color: '#000000' }}>Kumaş Kodu</p>
              {onChange ? (
                <input
                  type="text"
                  value={order.fabricCode}
                  onChange={(e) => onChange({ fabricCode: e.target.value })}
                  className="w-full bg-transparent border-0 border-b-2 border-black font-bold text-xl pb-1 outline-none focus:bg-black/[0.02] transition-colors"
                  style={{ color: '#000000' }}
                  title="Doğrudan düzenlemek için tıklayın"
                />
              ) : (
                <span className={cn("text-xl font-bold pb-1 border-b-2 block w-full", isLongFabric ? "break-words" : "truncate")} style={{ borderBottom: '2px solid #000000', color: '#000000' }}>
                  {order.fabricCode}
                </span>
              )}
            </div>
            <div className="min-w-0 flex flex-col items-start w-full">
              <p className="text-[9px] font-bold uppercase text-black mb-1" style={{ fontSize: `${Math.max(6.5, scale * 8.5)}px`, color: '#000000' }}>Kumaş Yönü</p>
              {onChange ? (
                <input
                  type="text"
                  value={order.lineDirection}
                  onChange={(e) => onChange({ lineDirection: e.target.value })}
                  className="w-full bg-transparent border-0 border-b-2 border-black font-bold uppercase text-xl pb-1 outline-none focus:bg-black/[0.02] transition-colors"
                  style={{ color: '#000000' }}
                  title="Doğrudan düzenlemek için tıklayın"
                />
              ) : (
                <span className={cn("text-xl font-bold uppercase pb-1 border-b-2 block w-full", isLongFabric ? "break-words" : "truncate")} style={{ borderBottom: '2px solid #000000', color: '#000000' }}>
                  {order.lineDirection}
                </span>
              )}
            </div>
          </div>

          {/* Dimensions Row */}
          <div className="min-w-0 flex flex-col items-start w-full">
            <p className="text-[9px] font-bold uppercase text-black mb-1" style={{ fontSize: `${Math.max(6.5, scale * 8.5)}px`, color: '#000000' }}>Ürün Boyutları</p>
            {onChange ? (
              <input
                type="text"
                value={order.dimensions}
                onChange={(e) => onChange({ dimensions: e.target.value })}
                className="w-full bg-transparent border-0 border-b-2 border-black font-mono font-bold text-2xl pb-1 outline-none focus:bg-black/[0.02] transition-colors"
                style={{ color: '#000000' }}
                title="Doğrudan düzenlemek için tıklayın"
              />
            ) : (
              <span className="text-2xl font-mono font-bold truncate leading-none pb-1 border-b-2 block w-full" style={{ borderBottom: '2px solid #000000', color: '#000000' }}>
                {order.dimensions}
              </span>
            )}
          </div>

          {/* Extra Info - Outer border/dashed line and padding completely removed */}
          <div className="min-h-0 flex flex-col justify-start mt-1 w-full">
            <p className="text-[9px] font-bold uppercase text-black mb-1" style={{ fontSize: `${Math.max(6.5, scale * 8.5)}px`, color: '#000000' }}>Ek Bilgi</p>
            <div className="min-h-[45px] overflow-hidden flex items-start w-full">
              {onChange ? (
                <textarea
                  value={order.extraInfo === '-' ? '' : order.extraInfo}
                  onChange={(e) => onChange({ extraInfo: e.target.value })}
                  placeholder="Ek bilgi girmek için tıklayın..."
                  className="w-full bg-transparent border-b border-black/10 font-semibold italic text-sm leading-snug outline-none resize-none focus:bg-black/[0.02] focus:border-black/30 h-full placeholder:text-gray-400"
                  style={{ color: '#000000' }}
                  rows={2}
                />
              ) : (
                <p className="text-sm font-semibold italic text-black leading-snug break-words w-full" style={{ color: '#000000' }}>
                  {order.extraInfo && order.extraInfo !== '-' ? order.extraInfo : ''}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Date block centered above the separator line */}
        <div className="flex justify-center items-center pb-2">
          <span className="font-mono font-bold text-black leading-none" style={{ fontSize: `${Math.max(14, scale * 18)}px`, color: '#000000' }}>
            {dateStr}
          </span>
        </div>

        {/* Branding Signature at the bottom with the separator line above it */}
        <div className="pt-2 flex justify-center items-center" style={{ borderTop: `${Math.max(1.5, scale * 2)}px solid #000000` }}>
          <span className="font-sans font-black tracking-[0.255em] text-black uppercase" style={{ fontSize: `${Math.max(9, scale * 10)}px`, color: '#000000' }}>
            DBD Textile
          </span>
        </div>
      </div>
    </div>
  );
};
