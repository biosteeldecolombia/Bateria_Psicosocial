// Catálogo de permisos y valores por defecto de cada rol. El administrador puede conceder o quitar permisos a los demás roles
// desde Usuarios → Roles y permisos; solo se guardan las diferencias frente a estos valores.
import type { Role } from './index';

export type PermissionKey =
  | 'workflow.view'
  | 'workflow.manage'
  | 'campaigns.view'
  | 'campaigns.create'
  | 'campaigns.edit'
  | 'campaigns.delete'
  | 'campaigns.credentials'
  | 'campaigns.email'
  | 'results.view'
  | 'results.fill'
  | 'exports.download'
  | 'rights.manage'
  | 'companies.manage'
  | 'users.manage'
  | 'audit.view'
  | 'settings.manage'
  | 'templates.edit'
  | 'roles.manage'
  | 'company.reports';

export interface PermissionDef {
  key: PermissionKey;
  group: string;
  label: string;
  description: string;
  /** Solo el administrador: no se puede conceder a otros roles (evita que se pierda el control del sistema). */
  adminOnly?: boolean;
}

export const PERMISSIONS: readonly PermissionDef[] = [
  { key: 'workflow.view', group: 'Flujo de trabajo', label: 'Ver el flujo de trabajo', description: 'Tablero con el estado de las campañas, pendientes por revisar y tiempos.' },
  { key: 'workflow.manage', group: 'Flujo de trabajo', label: 'Cambiar etapas y asignar responsables', description: 'Mover una campaña de etapa (p. ej. «En evaluación») y asignar quién responde de cada proceso.' },
  { key: 'campaigns.view', group: 'Campañas', label: 'Ver campañas y empresas', description: 'Listado de campañas y empresas dentro de lo que tiene asignado.' },
  { key: 'campaigns.create', group: 'Campañas', label: 'Crear campañas', description: 'Crear una campaña y generar su credencial de acceso.' },
  { key: 'campaigns.edit', group: 'Campañas', label: 'Editar, abrir y cerrar campañas', description: 'Renombrar, cambiar la psicóloga responsable, abrir y cerrar.' },
  { key: 'campaigns.delete', group: 'Campañas', label: 'Eliminar campañas', description: 'Eliminar definitivamente una campaña (pide contraseña).' },
  { key: 'campaigns.credentials', group: 'Campañas', label: 'Ver y regenerar la credencial (llave)', description: 'Ver el usuario y la contraseña de la campaña y generar una nueva.' },
  { key: 'campaigns.email', group: 'Campañas', label: 'Enviar credenciales por correo', description: 'Enviar a una o varias personas el usuario, la contraseña y el enlace de la campaña.' },
  { key: 'results.view', group: 'Resultados', label: 'Ver resultados y personas', description: 'Resultados individuales y de grupo, con motivo de acceso.' },
  { key: 'results.fill', group: 'Resultados', label: 'Diligenciar formatos y evaluar', description: 'Diligenciar los formatos de evaluación, la interpretación del CLQ y marcar personas como evaluadas.' },
  { key: 'exports.download', group: 'Documentos', label: 'Descargar PDF y expedientes', description: 'Expedientes e informes en PDF, individuales y masivos.' },
  { key: 'rights.manage', group: 'Documentos', label: 'Derechos de los titulares', description: 'Rectificar, reabrir, cambiar la forma A/B, suprimir datos y reponer códigos personales.' },
  { key: 'company.reports', group: 'Empresa cliente', label: 'Ver reportes agregados de su empresa', description: 'Reportes de grupo de la empresa cliente (sin respuestas individuales).' },
  { key: 'companies.manage', group: 'Administración', label: 'Administrar empresas', description: 'Crear, editar, desactivar y eliminar empresas.', adminOnly: true },
  { key: 'users.manage', group: 'Administración', label: 'Administrar usuarios', description: 'Crear cuentas, restablecer contraseñas y activar o desactivar.', adminOnly: true },
  { key: 'roles.manage', group: 'Administración', label: 'Editar roles y permisos', description: 'Esta misma matriz.', adminOnly: true },
  { key: 'audit.view', group: 'Administración', label: 'Consultar la auditoría', description: 'Registro de auditoría y alertas de seguridad.', adminOnly: true },
  { key: 'settings.manage', group: 'Administración', label: 'Configuración y alertas', description: 'Parametrizar alertas y notificaciones.' },
  { key: 'templates.edit', group: 'Administración', label: 'Editar formatos PDF', description: 'Código, versión y apariencia de los PDF que genera la plataforma.' },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/** Roles cuyos permisos se pueden configurar. El administrador siempre tiene todos; el colaborador no tiene cuenta de personal. */
export const CONFIGURABLE_ROLES = ['psychologist', 'assistant', 'company'] as const;
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

const STAFF_COMMON: PermissionKey[] = ['workflow.view', 'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete', 'campaigns.credentials', 'campaigns.email', 'results.view', 'exports.download', 'rights.manage'];

/** Lo que cada rol puede hacer si el administrador no cambia nada (equivale al comportamiento histórico de la plataforma). */
export const DEFAULT_ROLE_PERMISSIONS: Record<ConfigurableRole, PermissionKey[]> = {
  psychologist: [...STAFF_COMMON, 'workflow.manage', 'results.fill'],
  assistant: STAFF_COMMON,
  company: ['company.reports'],
};

export type PermissionMatrix = Record<ConfigurableRole, Record<PermissionKey, boolean>>;

export function isConfigurableRole(role: string): role is ConfigurableRole {
  return (CONFIGURABLE_ROLES as readonly string[]).includes(role);
}

export function defaultMatrix(): PermissionMatrix {
  const out = {} as PermissionMatrix;
  for (const r of CONFIGURABLE_ROLES) {
    out[r] = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, DEFAULT_ROLE_PERMISSIONS[r].includes(k)])) as Record<PermissionKey, boolean>;
  }
  return out;
}

/** ¿Puede este rol ejercer el permiso? El administrador siempre; el colaborador nunca. Los permisos solo-admin nunca salen del administrador. */
export function roleCan(matrix: PermissionMatrix, role: Role, key: PermissionKey): boolean {
  if (role === 'admin') return true;
  if (!isConfigurableRole(role)) return false;
  if (PERMISSIONS.find((p) => p.key === key)?.adminOnly) return false;
  return matrix[role][key] === true;
}

// ---------- Flujo de trabajo ----------
/** Etapas de una campaña, en orden. Cada cambio queda con fecha y persona en `workflow_events`. */
export const WORKFLOW_STAGES = [
  { key: 'created', label: 'Campaña creada', hint: 'Credencial generada; aún nadie responde.' },
  { key: 'in_progress', label: 'En curso', hint: 'Las personas están respondiendo.' },
  { key: 'finished', label: 'Respuestas finalizadas', hint: 'Campaña cerrada; lista para revisión de la psicóloga.' },
  { key: 'in_evaluation', label: 'En evaluación psicológica', hint: 'La psicóloga está revisando resultados y diligenciando formatos.' },
  { key: 'evaluated', label: 'Evaluada por la psicóloga', hint: 'Toda la campaña fue evaluada.' },
  { key: 'delivered', label: 'Informe entregado', hint: 'Los documentos se entregaron a la empresa.' },
] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number]['key'];
export const WORKFLOW_STAGE_KEYS = WORKFLOW_STAGES.map((s) => s.key) as WorkflowStage[];
export const WORKFLOW_LABEL: Record<WorkflowStage, string> = Object.fromEntries(WORKFLOW_STAGES.map((s) => [s.key, s.label])) as Record<WorkflowStage, string>;

/** Procesos con responsable asignable. */
export const WORKFLOW_OWNERS = [
  { key: 'application', label: 'Aplicación (acompaña a las personas mientras responden)' },
  { key: 'evaluation', label: 'Evaluación psicológica' },
  { key: 'delivery', label: 'Entrega de informes' },
] as const;
export type WorkflowOwnerKey = (typeof WORKFLOW_OWNERS)[number]['key'];

export const REVIEW_STATUSES = ['pending', 'in_review', 'evaluated'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_LABEL: Record<ReviewStatus, string> = { pending: 'Por revisar', in_review: 'En revisión', evaluated: 'Evaluada' };

// ---------- Alertas y notificaciones parametrizables ----------
export interface AlertRuleDef {
  key: string;
  label: string;
  /** Plantilla del mensaje; {n} es la cantidad y {days} el umbral. */
  template: string;
  roles: ConfigurableRole[] | 'admin+psychologist';
  unit?: 'days' | 'hours' | 'count';
  defaultThreshold: number;
}

export const ALERT_RULES: readonly AlertRuleDef[] = [
  { key: 'review_pending', label: 'Personas por evaluar', template: 'Hay {n} personas esperando evaluación psicométrica.', roles: 'admin+psychologist', unit: 'count', defaultThreshold: 1 },
  { key: 'formatos_pending', label: 'Formatos por diligenciar', template: 'Hay {n} formatos a la espera de diligenciarse.', roles: 'admin+psychologist', unit: 'count', defaultThreshold: 1 },
  { key: 'campaign_idle', label: 'Campaña sin avance', template: '{n} campañas llevan más de {days} días en curso sin cerrarse.', roles: 'admin+psychologist', unit: 'days', defaultThreshold: 7 },
  { key: 'evaluation_slow', label: 'Evaluación demorada', template: '{n} campañas llevan más de {days} días esperando o en evaluación.', roles: 'admin+psychologist', unit: 'days', defaultThreshold: 5 },
  { key: 'stuck_participants', label: 'Personas con el cuestionario a medias', template: '{n} personas llevan más de {days} horas sin terminar su cuestionario.', roles: 'admin+psychologist', unit: 'hours', defaultThreshold: 24 },
  { key: 'formatos_ready', label: 'Formatos listos para descargar', template: 'Hay {n} formatos listos para descargar.', roles: ['assistant'], unit: 'count', defaultThreshold: 1 },
];

export interface AlertSettings {
  /** Regla → activada. */
  enabled: Record<string, boolean>;
  threshold: Record<string, number>;
  /** Enviar un resumen diario por correo a la psicóloga o responsable (requiere correo configurado). */
  dailyEmail: boolean;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  enabled: Object.fromEntries(ALERT_RULES.map((r) => [r.key, true])),
  threshold: Object.fromEntries(ALERT_RULES.map((r) => [r.key, r.defaultThreshold])),
  dailyEmail: false,
};
