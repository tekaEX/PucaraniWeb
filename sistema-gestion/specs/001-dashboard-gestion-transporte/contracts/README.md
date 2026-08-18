# Contracts

Este proyecto sigue un enfoque de aplicación web interna con datos operativos y paneles administrables. No hay un contrato externo formal de API para usuarios finales; la integración principal es con Supabase y con la capa de sesión/autenticación del propio app router.

Los contratos relevantes en este feature son los de dominio y UI:
- queries de dashboard y KPIs
- listados de cotizaciones, viajes y facturas
- reads/writes por periodo global
- alertas de vencimientos legales
- estados derivados de cobro y facturación

Cuando se introduzca una integración externa más fuerte, por ejemplo SII, se definirá un contrato específico bajo este directorio.
