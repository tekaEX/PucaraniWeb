import { PageHeader } from "@/components/page-header";
import { ClienteForm } from "../cliente-form";

export const metadata = { title: "Nuevo cliente" };

export default function NuevoClientePage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nuevo cliente" />
      <ClienteForm />
    </div>
  );
}
