import { IconPetri } from '@/components/Icons';

// Marca de las pantallas de acceso: mismo símbolo (placa de Petri) y misma tipografía (serif cursiva)
// que la cabecera del dashboard.
export default function AuthBrand() {
  return (
    <div className="mb-7 flex items-center gap-2.5">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <IconPetri />
      </span>
      <h1 className="font-display text-[23px] italic leading-none tracking-normal">Academia de Microbiología</h1>
    </div>
  );
}
