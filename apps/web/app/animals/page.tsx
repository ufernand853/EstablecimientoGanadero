"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { getApiUrl } from "../lib/api-url";
import { useI18n } from "../lib/i18n";

const API_URL = getApiUrl();
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

type Establishment = { id: string; name: string };
type Breed = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };
type HerdCategory = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };
type Animal = {
  id: string;
  establishmentId: string;
  earTag: string;
  name: string;
  sex: "MACHO" | "HEMBRA" | "OTRO";
  breed: string | null;
  birthDate: string | null;
  category: string | null;
  status: "ACTIVO" | "VENDIDO" | "MUERTO";
  notes: string | null;
};
type AnimalPhoto = {
  id: string;
  animalId: string;
  imageUrl: string;
  caption: string | null;
  takenAt: string | null;
  uploadedAt: string;
};

export default function AnimalsPage() {
  const { t } = useI18n();
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [categories, setCategories] = useState<HerdCategory[]>([]);
  const [selectedAnimalId, setSelectedAnimalId] = useState("");
  const [photos, setPhotos] = useState<AnimalPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [earTag, setEarTag] = useState("");
  const [name, setName] = useState("");
  const [sex, setSex] = useState<"MACHO" | "HEMBRA" | "OTRO">("OTRO");
  const [breed, setBreed] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [takenAt, setTakenAt] = useState("");
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  const loadEstablishments = async () => {
    const response = await fetch(`${API_URL}/establishments`);
    const data = (await response.json()) as { establishments: Establishment[] };
    setEstablishments(data.establishments);
    if (!establishmentId && data.establishments.length) {
      setEstablishmentId(data.establishments[0]?.id ?? "");
    }
  };

  const loadAnimals = async (selectedEstablishmentId: string) => {
    if (!selectedEstablishmentId) return;
    const [animalResponse, breedResponse, categoryResponse] = await Promise.all([
      fetch(`${API_URL}/animals?establishmentId=${selectedEstablishmentId}`, { cache: "no-store" }),
      fetch(`${API_URL}/breeds?establishmentId=${selectedEstablishmentId}&status=ACTIVE`, { cache: "no-store" }),
      fetch(`${API_URL}/herd-categories?establishmentId=${selectedEstablishmentId}&status=ACTIVE`, { cache: "no-store" }),
    ]);
    if (!animalResponse.ok) throw new Error(t("animals.loadError"));
    const data = (await animalResponse.json()) as { animals: Animal[] };
    const breedData = (await breedResponse.json()) as { breeds: Breed[] };
    const categoryData = (await categoryResponse.json()) as { categories: HerdCategory[] };
    setAnimals(data.animals);
    setBreeds(breedData.breeds);
    setCategories(categoryData.categories);
    if (data.animals.length) {
      setSelectedAnimalId((prev) => (prev && data.animals.some((animal) => animal.id === prev) ? prev : data.animals[0]?.id ?? ""));
    } else {
      setSelectedAnimalId("");
      setPhotos([]);
    }
  };

  const loadPhotos = async (animalId: string) => {
    if (!animalId) return;
    const response = await fetch(`${API_URL}/animals/${animalId}/photos`, { cache: "no-store" });
    if (!response.ok) throw new Error(t("animals.loadPhotosError"));
    const data = (await response.json()) as { photos: AnimalPhoto[] };
    setPhotos(data.photos);
  };

  useEffect(() => {
    loadEstablishments().catch(() => setError(t("animals.loadEstablishmentsError")));
  }, [t]);

  useEffect(() => {
    if (!establishmentId) return;
    loadAnimals(establishmentId).catch((loadError) => setError(loadError instanceof Error ? loadError.message : t("animals.loadError")));
  }, [establishmentId, t]);

  useEffect(() => {
    if (!selectedAnimalId) return;
    loadPhotos(selectedAnimalId).catch(() => setError(t("animals.loadPhotosError")));
  }, [selectedAnimalId, t]);

  const handleCreateAnimal = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch(`${API_URL}/animals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          earTag,
          name,
          sex,
          breed: breed || null,
          birthDate: birthDate ? new Date(`${birthDate}T00:00:00.000Z`).toISOString() : null,
          category: category || null,
          notes: notes || null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? t("animals.createError"));
      }
      setEarTag("");
      setName("");
      setBreed("");
      setBirthDate("");
      setCategory("");
      setNotes("");
      await loadAnimals(establishmentId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("animals.unexpectedError"));
    }
  };

  const convertFileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error(t("animals.unexpectedError")));
      }
    };
    reader.onerror = () => reject(new Error(t("animals.unexpectedError")));
    reader.readAsDataURL(file);
  });

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setError(null);

    if (!file) {
      setSelectedFile(null);
      setSelectedFilePreview(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError(t("animals.invalidImage"));
      setSelectedFile(null);
      setSelectedFilePreview(null);
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError(t("animals.fileTooLarge"));
      setSelectedFile(null);
      setSelectedFilePreview(null);
      return;
    }

    setSelectedFile(file);
    setSelectedFilePreview(URL.createObjectURL(file));
  };

  const handleAddPhoto = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!selectedAnimalId || !selectedFile) {
      setError(t("animals.missingPhotoData"));
      return;
    }

    try {
      const imageUrl = await convertFileToDataUrl(selectedFile);
      const response = await fetch(`${API_URL}/animals/${selectedAnimalId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          caption: caption || null,
          takenAt: takenAt ? new Date(`${takenAt}T00:00:00.000Z`).toISOString() : null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? t("animals.photoError"));
      }
      setSelectedFile(null);
      setSelectedFilePreview(null);
      setCaption("");
      setTakenAt("");
      await loadPhotos(selectedAnimalId);
      await loadAnimals(establishmentId);
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : t("animals.unexpectedError"));
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!selectedAnimalId) return;
    setError(null);
    setDeletingPhotoId(photoId);
    try {
      const response = await fetch(`${API_URL}/animals/${selectedAnimalId}/photos/${photoId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? t("animals.unexpectedError"));
      }
      await loadPhotos(selectedAnimalId);
      await loadAnimals(establishmentId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("animals.unexpectedError"));
    } finally {
      setDeletingPhotoId(null);
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t("animals.title")}</h2>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(e) => setEstablishmentId(e.target.value)}>
          {establishments.map((est) => <option key={est.id} value={est.id}>{est.name}</option>)}
        </select>
      </header>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("animals.createTitle")}</h3>
        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={handleCreateAnimal}>
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder={t("animals.earTag")} value={earTag} onChange={(e) => setEarTag(e.target.value)} required />
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder={t("animals.name")} value={name} onChange={(e) => setName(e.target.value)} required />
          <select className="rounded bg-slate-800 p-2 text-sm" value={sex} onChange={(e) => setSex(e.target.value as "MACHO" | "HEMBRA" | "OTRO")}>
            <option value="MACHO">{t("animals.sex.male")}</option>
            <option value="HEMBRA">{t("animals.sex.female")}</option>
            <option value="OTRO">{t("animals.sex.other")}</option>
          </select>
          <select className="rounded bg-slate-800 p-2 text-sm" value={breed} onChange={(e) => setBreed(e.target.value)}>
            <option value="">{t("animals.breedPlaceholder")}</option>
            {breeds.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
          <input className="rounded bg-slate-800 p-2 text-sm" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          <select className="rounded bg-slate-800 p-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("animals.categoryPlaceholder")}</option>
            {categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
          <input className="rounded bg-slate-800 p-2 text-sm md:col-span-2" placeholder={t("animals.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">{t("animals.save")}</button>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-slate-900 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("animals.listTitle")}</h3>
          <div className="mt-3 grid gap-2">
            {animals.map((animal) => (
              <button key={animal.id} type="button" onClick={() => setSelectedAnimalId(animal.id)} className={`rounded border p-3 text-left text-sm ${selectedAnimalId === animal.id ? "border-emerald-500 bg-slate-800" : "border-slate-800"}`}>
                <p className="font-semibold">{animal.earTag} · {animal.name}</p>
                <p className="text-slate-400">{animal.category ?? t("animals.emptyCategory")} · {animal.breed ?? t("animals.emptyBreed")}</p>
              </button>
            ))}
            {animals.length === 0 && <p className="text-sm text-slate-400">{t("animals.empty")}</p>}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("animals.photosTitle")}</h3>
          <form className="mt-3 grid gap-2" onSubmit={handleAddPhoto}>
            <input className="rounded bg-slate-800 p-2 text-sm" type="file" accept="image/*" onChange={handleFileSelection} required />
            {selectedFilePreview && <img src={selectedFilePreview} alt={t("animals.photoPreviewAlt")} className="h-40 w-full rounded object-cover" />}
            <input className="rounded bg-slate-800 p-2 text-sm" placeholder={t("animals.caption")} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <input className="rounded bg-slate-800 p-2 text-sm" type="date" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
            <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50" disabled={!selectedAnimalId || !selectedFile} type="submit">{t("animals.uploadPhoto")}</button>
          </form>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {photos.map((photo) => (
              <article key={photo.id} className="overflow-hidden rounded border border-slate-800">
                <img src={photo.imageUrl} alt={photo.caption ?? t("animals.photoAlt")} className="h-28 w-full object-cover" />
                <div className="p-2 text-xs text-slate-300">
                  <p>{photo.caption ?? t("animals.emptyCaption")}</p>
                  <button
                    type="button"
                    className="mt-2 rounded bg-red-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={deletingPhotoId === photo.id}
                    onClick={() => handleDeletePhoto(photo.id)}
                  >
                    {deletingPhotoId === photo.id ? t("animals.deletingPhoto") : t("animals.deletePhoto")}
                  </button>
                </div>
              </article>
            ))}
            {photos.length === 0 && <p className="col-span-2 text-sm text-slate-400">{t("animals.emptyPhotos")}</p>}
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </main>
  );
}
