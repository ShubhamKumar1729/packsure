/**
 * Where everything lives and how to get there.
 */

import type { KnowledgeDoc } from './types'

export const NAVIGATION_DOCS: KnowledgeDoc[] = [
  {
    id: 'navigation-sections',
    title: 'Where everything is: sections and routes',
    category: 'navigation',
    text: 'The workspace sidebar and these routes cover the whole app: /app is the dashboard; /app/new-inspection starts the capture wizard; /app/inspections lists inspections and /app/inspections/<id> opens one; /app/inspections/<id>/review is the human review screen; /app/products lists products and /app/products/<id> shows a product with its inspection history; /app/reports lists reports and /app/reports/<id> opens one; /app/rules is rule administration (admins). The login page is /login. The sidebar shows only the entries your role can access.',
  },
  {
    id: 'navigation-howto',
    title: 'How to navigate and ask the assistant to navigate',
    category: 'navigation',
    text: 'Use the sidebar on the left (or the menu button on small screens) to switch sections; the header shows the current page title. You can also simply tell the assistant where you want to go, for example "take me to the reports" or "open the rules page", and it will navigate for you. To look at a specific record, open it from its list page, or ask the assistant to open a record whose ID you mention.',
  },
]
