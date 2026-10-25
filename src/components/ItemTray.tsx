import { useState } from 'react';
import { Badge, Button, Card, Modal, cn } from './ui';
import { itemMeta } from '../lib/items';
import type { ItemDefinition, RoomState } from '../types';

export function ItemTray({
  state,
  busy,
  onUse,
}: {
  state: RoomState;
  busy: boolean;
  onUse: (itemId: string, targetPlayerId: string | null) => Promise<void>;
}) {
  const items = state.items;
  const [selected, setSelected] = useState<ItemDefinition | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [using, setUsing] = useState(false);

  if (!items?.enabled) return null;

  const meta = selected ? itemMeta(selected.itemType) : null;
  const candidates = state.players.filter(
    (player) => player.playerId !== state.me.playerId && player.status === 'active',
  );
  const canConfirm =
    Boolean(selected) &&
    items.canUse &&
    !busy &&
    !using &&
    (!meta?.targetRequired || Boolean(target));

  const open = (item: ItemDefinition) => {
    if (!items.canUse || busy) return;
    const info = itemMeta(item.itemType);
    setSelected(item);
    setTarget(info.targetRequired ? candidates[0]?.playerId ?? null : null);
  };

  const close = () => {
    if (using) return;
    setSelected(null);
    setTarget(null);
  };

  const confirm = async () => {
    if (!selected || !canConfirm) return;
    setUsing(true);
    try {
      await onUse(selected.id, meta?.targetRequired ? target : null);
      setSelected(null);
      setTarget(null);
    } finally {
      setUsing(false);
    }
  };

  return (
    <>
      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
              Tus ítems
            </h2>
            <p className="mt-1 text-[10px] text-white/25">
              {items.multiple ? 'Hasta 3 · el cuarto borra todos' : 'Máximo 1 a la vez'}
            </p>
          </div>
          <Badge tone={items.canUse ? 'gold' : 'muted'}>
            {items.myItems.length} {items.myItems.length === 1 ? 'ítem' : 'ítems'}
          </Badge>
        </div>

        {items.myItems.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/25">
            Sin ítems todavía. Responde bien o prueba suerte.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {items.myItems.map((item) => {
              const itemInfo = itemMeta(item.itemType);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => open(item)}
                  disabled={!items.canUse || busy}
                  title={itemInfo.description}
                  className={cn(
                    'flex min-w-[130px] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left transition',
                    items.canUse && !busy
                      ? 'hover:border-gold-400/40 hover:bg-gold-400/[0.07]'
                      : 'cursor-not-allowed opacity-55',
                  )}
                >
                  <span className="text-xl">{itemInfo.emoji}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-white">
                      {itemInfo.name}
                    </span>
                    <span className="block text-[10px] text-white/30">
                      {itemInfo.targetRequired ? 'Elegir víctima' : 'Al azar'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!items.canUse && (
          <p className="mt-3 text-[10px] leading-relaxed text-white/25">
            Solo puedes usar ítems durante tu turno y antes de responder.
          </p>
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        title={meta ? `${meta.emoji} ${meta.name}` : 'Usar ítem'}
        description={meta?.description}
        confirmLabel={using ? 'Usando…' : 'Usar ítem'}
        onConfirm={() => void confirm()}
        onClose={close}
        loading={using}
        tone="danger"
      >
        {meta?.targetRequired ? (
          <div>
            <p className="label">Elige una víctima</p>
            <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
              {candidates.map((player) => (
                <button
                  key={player.playerId}
                  type="button"
                  onClick={() => setTarget(player.playerId)}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm',
                    target === player.playerId
                      ? 'border-gold-400/50 bg-gold-400/[0.08] text-white'
                      : 'border-white/10 bg-white/[0.025] text-white/70',
                  )}
                >
                  <span className="truncate">{player.nickname}</span>
                  {target === player.playerId && <span className="text-gold-300">✓</span>}
                </button>
              ))}
              {candidates.length === 0 && (
                <p className="text-xs text-white/35">No hay jugadores activos disponibles.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] px-3 py-3 text-xs leading-relaxed text-cyan-100/70">
            Este ítem elegirá su víctima y efecto automáticamente.
          </p>
        )}
      </Modal>
    </>
  );
}
