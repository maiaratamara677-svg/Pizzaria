import React, { useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, Link2, Pizza, Plus, Trash2, Upload, X } from 'lucide-react';
import type { AppSnapshot, MenuItem } from '../types.ts';
import { formatBRL } from '../utils/format.ts';

interface MenuViewProps {
  snapshot: AppSnapshot;
  onToggleAvailability: (id: string, available: boolean) => Promise<void>;
  onUpdatePrices: (
    id: string,
    prices: { media?: number; grande: number; gigante?: number }
  ) => Promise<void>;
  onUpdatePhoto: (id: string, imageUrl: string) => Promise<void>;
  onAddMenuItem: (item: Omit<MenuItem, 'id'>) => Promise<void>;
}

const CATEGORIES: ('Todos' | MenuItem['category'])[] = [
  'Todos',
  'Tradicionais',
  'Especiais',
  'Doces',
  'Bebidas',
];

const GALLERY_PRESETS = [
  {
    label: 'Margherita Napoletana',
    url: '/src/assets/images/pizza_margherita_napoletana_1794590306126.jpg',
  },
  {
    label: 'Calabresa Artesanal',
    url: '/src/assets/images/pizza_calabresa_artesanal_1794590305648.jpg',
  },
  {
    label: 'Quatro Queijos',
    url: '/src/assets/images/pizza_quatro_queijos_1794590306727.jpg',
  },
  {
    label: 'Pizza na Pá / Forno',
    url: '/src/assets/images/pizza_artisan_backdrop_1794612473764.jpg',
  },
  {
    label: 'Forno a Lenha',
    url: '/src/assets/images/pizzeria_brand_oven_1794590306689.jpg',
  },
];

async function resizeImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido.'));
      img.onload = () => {
        const maxDim = 800;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const MenuView: React.FC<MenuViewProps> = ({
  snapshot,
  onToggleAvailability,
  onUpdatePrices,
  onUpdatePhoto,
  onAddMenuItem,
}) => {
  const [category, setCategory] = useState<'Todos' | MenuItem['category']>('Todos');
  const [showAddForm, setShowAddForm] = useState(false);

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<{
    media: string;
    grande: string;
    gigante: string;
  }>({ media: '', grande: '', gigante: '' });
  const [savingPrices, setSavingPrices] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);

  const [photoModalItem, setPhotoModalItem] = useState<MenuItem | null>(null);
  const [photoUrlDraft, setPhotoUrlDraft] = useState('');
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const newItemFileInputRef = useRef<HTMLInputElement | null>(null);

  const [newItem, setNewItem] = useState({
    name: '',
    category: 'Especiais' as MenuItem['category'],
    description: '',
    priceMedia: '58',
    priceGrande: '72',
    priceGigante: '88',
    imageUrl: '',
  });

  const filteredMenu = useMemo(() => {
    if (category === 'Todos') return snapshot.menu;
    return snapshot.menu.filter((m) => m.category === category);
  }, [snapshot.menu, category]);

  const startEditingPrices = (item: MenuItem) => {
    setEditingPriceId(item.id);
    setPriceDraft({
      media: item.prices.media !== undefined ? String(item.prices.media) : '',
      grande: String(item.prices.grande),
      gigante: item.prices.gigante !== undefined ? String(item.prices.gigante) : '',
    });
  };

  const handleSavePrices = async (item: MenuItem, e: React.FormEvent) => {
    e.preventDefault();
    const grande = Number(priceDraft.grande);
    if (!Number.isFinite(grande) || grande <= 0) {
      setMenuError('Informe um valor válido maior que zero para o tamanho principal.');
      return;
    }

    setSavingPrices(true);
    setMenuError(null);
    try {
      if (item.category === 'Bebidas') {
        await onUpdatePrices(item.id, { grande });
      } else {
        const media = Number(priceDraft.media);
        const gigante = Number(priceDraft.gigante);
        await onUpdatePrices(item.id, {
          media: Number.isFinite(media) && media > 0 ? media : undefined,
          grande,
          gigante: Number.isFinite(gigante) && gigante > 0 ? gigante : undefined,
        });
      }
      setEditingPriceId(null);
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : 'Erro ao atualizar preços.');
    } finally {
      setSavingPrices(false);
    }
  };

  const openPhotoModal = (item: MenuItem) => {
    setPhotoModalItem(item);
    setPhotoUrlDraft(item.imageUrl ?? '');
    setPhotoError(null);
  };

  const handleSavePhoto = async (urlToSave: string) => {
    if (!photoModalItem) return;
    setSavingPhoto(true);
    setPhotoError(null);
    try {
      await onUpdatePhoto(photoModalItem.id, urlToSave.trim());
      setPhotoModalItem(null);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Erro ao atualizar foto.');
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'modal' | 'newItem'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setMenuError(null);
    if (!file.type.startsWith('image/')) {
      const msg = 'Selecione um arquivo de imagem válido (JPG, PNG ou WebP).';
      if (target === 'modal') setPhotoError(msg);
      else setMenuError(msg);
      e.target.value = '';
      return;
    }
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      if (target === 'modal') {
        setPhotoUrlDraft(dataUrl);
      } else {
        setNewItem((prev) => ({ ...prev, imageUrl: dataUrl }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar imagem.';
      if (target === 'modal') setPhotoError(msg);
      else setMenuError(msg);
    } finally {
      e.target.value = '';
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    const grande = Number(newItem.priceGrande) || 68;
    const isDrink = newItem.category === 'Bebidas';
    setMenuError(null);

    try {
      await onAddMenuItem({
        name: newItem.name.trim(),
        category: newItem.category,
        description: newItem.description.trim() || 'Preparo artesanal em forno a lenha.',
        prices: isDrink
          ? { grande }
          : {
              media: Number(newItem.priceMedia) || Math.round(grande * 0.8),
              grande,
              gigante: Number(newItem.priceGigante) || Math.round(grande * 1.2),
            },
        imageUrl: newItem.imageUrl.trim() || undefined,
        available: true,
      });

      setNewItem({
        name: '',
        category: 'Especiais',
        description: '',
        priceMedia: '58',
        priceGrande: '72',
        priceGigante: '88',
        imageUrl: '',
      });
      setShowAddForm(false);
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : 'Erro ao criar item no cardápio.');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Cardápio & Preços por Tamanho</h1>
          <p className="text-xs text-stone-600 mt-1">
            Edite o valor de cada tamanho (Média, Grande e Gigante) e troque as fotos quando quiser — a IA usa estes valores em tempo real no WhatsApp.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors whitespace-nowrap shrink-0"
        >
          {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAddForm ? 'Fechar Formulário' : 'Adicionar Item'}
        </button>
      </div>

      {menuError && (
        <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-2">
          <span>{menuError}</span>
          <button
            type="button"
            onClick={() => setMenuError(null)}
            className="text-red-700 hover:text-red-900"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showAddForm && (
        <form
          onSubmit={handleCreate}
          className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-5 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">Nome do Item</label>
            <input
              type="text"
              required
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="Ex: Parma & Rúcula"
              className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">Categoria</label>
            <select
              value={newItem.category}
              onChange={(e) =>
                setNewItem({ ...newItem, category: e.target.value as MenuItem['category'] })
              }
              className="w-full px-3 py-1.5 text-xs border border-stone-200 rounded-md bg-white"
            >
              <option value="Tradicionais">Tradicionais</option>
              <option value="Especiais">Especiais</option>
              <option value="Doces">Doces</option>
              <option value="Bebidas">Bebidas</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              {newItem.category === 'Bebidas'
                ? 'Preço Único (R$)'
                : 'Preços por Tamanho: Média / Grande / Gigante (R$)'}
            </label>
            {newItem.category === 'Bebidas' ? (
              <input
                type="number"
                min="1"
                step="0.5"
                required
                value={newItem.priceGrande}
                onChange={(e) => setNewItem({ ...newItem, priceGrande: e.target.value })}
                className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-md"
              />
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  placeholder="M"
                  value={newItem.priceMedia}
                  onChange={(e) => setNewItem({ ...newItem, priceMedia: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  required
                  placeholder="G"
                  value={newItem.priceGrande}
                  onChange={(e) => setNewItem({ ...newItem, priceGrande: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  placeholder="GG"
                  value={newItem.priceGigante}
                  onChange={(e) => setNewItem({ ...newItem, priceGigante: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
              </div>
            )}
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Ingredientes / Descrição
            </label>
            <input
              type="text"
              value={newItem.description}
              onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
              placeholder="Molho San Marzano, presunto de Parma, rúcula fresca e lascas de parmesão."
              className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Foto do Produto (opcional)
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={newItemFileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e, 'newItem')}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => newItemFileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-stone-200 rounded-md hover:bg-stone-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {newItem.imageUrl ? 'Foto Selecionada' : 'Enviar Foto'}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800 transition-colors whitespace-nowrap"
              >
                Salvar Item
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="flex items-center gap-1 p-1 bg-stone-200/80 rounded-lg w-fit">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              category === cat ? 'bg-[#FFFDF9] text-stone-900 shadow-xs' : 'text-stone-600'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMenu.map((item) => {
          const isEditingThis = editingPriceId === item.id;
          const isDrink = item.category === 'Bebidas';

          return (
            <div
              key={item.id}
              className={`bg-[#FFFDF9]/95 border border-stone-200 rounded-lg overflow-hidden flex flex-col transition-opacity ${
                item.available ? 'opacity-100' : 'opacity-65'
              }`}
            >
              <div className="relative group">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-44 object-cover"
                  />
                ) : (
                  <div className="w-full h-44 bg-[#F3ECE1] flex flex-col items-center justify-center gap-1.5 text-stone-400">
                    <Pizza className="w-8 h-8" />
                    <span className="text-[11px]">Sem foto cadastrada</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => openPhotoModal(item)}
                  className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold bg-stone-900/85 hover:bg-stone-900 text-white rounded-md backdrop-blur-xs transition-colors shadow-xs"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Trocar Foto
                </button>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-stone-500">{item.category}</span>
                    <span
                      className={`text-[11px] font-semibold ${
                        item.available ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {item.available ? 'Disponível' : 'Esgotado'}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-stone-900 mt-1">{item.name}</h3>
                  <p className="text-xs text-stone-600 mt-1 leading-relaxed">{item.description}</p>
                </div>

                <div className="pt-3 border-t border-stone-100 space-y-2.5">
                  {isEditingThis ? (
                    <form
                      onSubmit={(e) => handleSavePrices(item, e)}
                      className="bg-[#FAF6F0] border border-stone-200 rounded-md p-2.5 space-y-2"
                    >
                      <div className="text-[11px] font-semibold text-stone-700">
                        {isDrink ? 'Editar valor unitário (R$)' : 'Editar valores por tamanho (R$)'}
                      </div>
                      {isDrink ? (
                        <div>
                          <label className="block text-[10px] text-stone-500 mb-0.5">
                            Unitário
                          </label>
                          <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            required
                            value={priceDraft.grande}
                            onChange={(e) =>
                              setPriceDraft({ ...priceDraft, grande: e.target.value })
                            }
                            className="w-full px-2 py-1 text-xs font-mono border border-stone-300 rounded bg-white"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] text-stone-500 mb-0.5">
                              Média (M)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={priceDraft.media}
                              onChange={(e) =>
                                setPriceDraft({ ...priceDraft, media: e.target.value })
                              }
                              placeholder="Opcional"
                              className="w-full px-2 py-1 text-xs font-mono border border-stone-300 rounded bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-stone-500 mb-0.5">
                              Grande (G)
                            </label>
                            <input
                              type="number"
                              min="1"
                              step="0.5"
                              required
                              value={priceDraft.grande}
                              onChange={(e) =>
                                setPriceDraft({ ...priceDraft, grande: e.target.value })
                              }
                              className="w-full px-2 py-1 text-xs font-mono border border-stone-300 rounded bg-white"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-stone-500 mb-0.5">
                              Gigante (GG)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={priceDraft.gigante}
                              onChange={(e) =>
                                setPriceDraft({ ...priceDraft, gigante: e.target.value })
                              }
                              placeholder="Opcional"
                              className="w-full px-2 py-1 text-xs font-mono border border-stone-300 rounded bg-white"
                            />
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingPriceId(null)}
                          className="px-2.5 py-1 text-[11px] text-stone-600 hover:text-stone-900"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={savingPrices}
                          className="px-3 py-1 text-[11px] font-semibold bg-emerald-700 text-white rounded hover:bg-emerald-800 disabled:opacity-60"
                        >
                          {savingPrices ? 'Salvando...' : 'Salvar Preços'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="text-stone-600 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono tabular-nums">
                        {item.prices.media !== undefined && (
                          <span>M: {formatBRL(item.prices.media)}</span>
                        )}
                        <span className="font-semibold text-stone-900">
                          {isDrink ? 'Un:' : 'G:'} {formatBRL(item.prices.grande)}
                        </span>
                        {item.prices.gigante !== undefined && (
                          <span>GG: {formatBRL(item.prices.gigante)}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => startEditingPrices(item)}
                        className="text-[11px] font-medium text-orange-800 hover:text-orange-950 underline whitespace-nowrap shrink-0"
                      >
                        Editar preços
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => onToggleAvailability(item.id, !item.available)}
                    className={`w-full py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      item.available
                        ? 'border-stone-200 text-stone-700 hover:bg-stone-50'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {item.available ? 'Marcar como Esgotado' : 'Reativar no Cardápio'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Trocar Foto do Produto */}
      {photoModalItem && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFDF9] border border-stone-200 rounded-xl w-full max-w-lg p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">
                  Trocar Foto · {photoModalItem.name}
                </h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Envie uma foto do seu aparelho, escolha da galeria ou cole um link de imagem.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhotoModalItem(null)}
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-lg overflow-hidden border border-stone-200 bg-[#F3ECE1] h-44 flex items-center justify-center">
              {photoUrlDraft ? (
                <img
                  src={photoUrlDraft}
                  alt={photoModalItem.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-stone-400 text-xs">
                  <ImagePlus className="w-7 h-7" />
                  <span>Nenhuma foto selecionada</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e, 'modal')}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-stone-900 text-white rounded-md hover:bg-stone-800 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Enviar Foto do Aparelho
              </button>
              {photoUrlDraft && (
                <button
                  type="button"
                  onClick={() => setPhotoUrlDraft('')}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover Foto
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-stone-600">
                Ou escolha da galeria da pizzaria:
              </div>
              <div className="grid grid-cols-5 gap-2">
                {GALLERY_PRESETS.map((preset) => (
                  <button
                    key={preset.url}
                    type="button"
                    onClick={() => setPhotoUrlDraft(preset.url)}
                    title={preset.label}
                    className={`rounded-md overflow-hidden border-2 transition-all h-14 ${
                      photoUrlDraft === preset.url
                        ? 'border-orange-600 ring-2 ring-orange-600/20'
                        : 'border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    <img
                      src={preset.url}
                      alt={preset.label}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600 mb-1">
                <Link2 className="w-3.5 h-3.5" />
                Ou cole o link (URL) da imagem:
              </label>
              <input
                type="text"
                value={photoUrlDraft.startsWith('data:') ? '' : photoUrlDraft}
                onChange={(e) => setPhotoUrlDraft(e.target.value)}
                placeholder={
                  photoUrlDraft.startsWith('data:')
                    ? 'Imagem local carregada (cole aqui para substituir por URL)'
                    : 'https://...'
                }
                className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-md font-mono"
              />
            </div>

            {photoError && (
              <div className="p-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
                {photoError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setPhotoModalItem(null)}
                className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingPhoto}
                onClick={() => handleSavePhoto(photoUrlDraft)}
                className="px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-60"
              >
                {savingPhoto ? 'Salvando...' : 'Salvar Foto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
