import { Breadcrumb, type SystemStyleObject } from "@chakra-ui/react"
import * as React from "react"
import { Link as RouterLink } from "react-router-dom"

export interface BreadcrumbRootProps extends Breadcrumb.RootProps {
  separator?: React.ReactNode
  separatorGap?: SystemStyleObject["gap"]
}

export const BreadcrumbRoot = React.forwardRef<
  HTMLDivElement,
  BreadcrumbRootProps
>(function BreadcrumbRoot(props, ref) {
  const { separator, separatorGap, children, ...rest } = props

  const validChildren = React.Children.toArray(children).filter(
    React.isValidElement,
  )

  return (
    <Breadcrumb.Root ref={ref} {...rest}>
      <Breadcrumb.List gap={separatorGap}>
        {validChildren.map((child, index) => {
          const last = index === validChildren.length - 1
          return (
            <React.Fragment key={index}>
              <Breadcrumb.Item>{child}</Breadcrumb.Item>
              {!last && (
                <Breadcrumb.Separator>{separator}</Breadcrumb.Separator>
              )}
            </React.Fragment>
          )
        })}
      </Breadcrumb.List>
    </Breadcrumb.Root>
  )
})

export const BreadcrumbLink = Breadcrumb.Link
export const BreadcrumbCurrentLink = Breadcrumb.CurrentLink
export const BreadcrumbEllipsis = Breadcrumb.Ellipsis

// Reusable page-level breadcrumb: an ordered list of crumbs, all but the last are links, the
// last is plain current-page text. Wraps the generated primitives above with the simple
// {label, to?} array API — this project's intended shape for every page that needs
// back-navigation going forward. First wired up on AlbumRatingPage only; see
// docs/decisions/deferred-work.md for the retrofit-elsewhere follow-up.
export interface PageBreadcrumbItem {
  label: string
  to?: string
}

export function PageBreadcrumb({ items }: { items: PageBreadcrumbItem[] }) {
  return (
    <BreadcrumbRoot color="text.dim" fontSize="sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        if (isLast || !item.to) {
          return <BreadcrumbCurrentLink key={item.label}>{item.label}</BreadcrumbCurrentLink>
        }
        return (
          <BreadcrumbLink key={item.label} as={RouterLink} to={item.to} _hover={{ color: "accent.text" }}>
            {item.label}
          </BreadcrumbLink>
        )
      })}
    </BreadcrumbRoot>
  )
}
