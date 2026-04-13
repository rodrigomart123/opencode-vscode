import "solid-js"

declare module "*.css"

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      sortable: boolean
    }
  }
}
