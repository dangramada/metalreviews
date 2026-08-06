import { RadioCard, type SystemStyleObject } from "@chakra-ui/react"
import * as React from "react"

interface RadioCardItemProps extends RadioCard.ItemProps {
  icon?: React.ReactElement
  label?: React.ReactNode
  description?: React.ReactNode
  addon?: React.ReactNode
  indicator?: React.ReactNode | null
  indicatorPlacement?: "start" | "end" | "inside"
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>
  // Ark/Chakra's radio-card recipe couples RadioCard.Root's `align` variant to BOTH
  // ItemControl's cross-axis alignItems (indicator vertical position) and ItemContent's own
  // alignItems (label/description block's horizontal position) via the same CSS var — they
  // can't be set independently through `align` alone. This lets a consumer override just
  // ItemContent's alignItems without touching ItemControl/the indicator. Optional, unset by
  // default, so existing consumers are unaffected.
  contentAlignItems?: SystemStyleObject["alignItems"]
}

export const RadioCardItem = React.forwardRef<
  HTMLInputElement,
  RadioCardItemProps
>(function RadioCardItem(props, ref) {
  const {
    inputProps,
    label,
    description,
    addon,
    icon,
    indicator = <RadioCard.ItemIndicator />,
    indicatorPlacement = "end",
    contentAlignItems,
    ...rest
  } = props

  const hasContent = label || description || icon
  const ContentWrapper = indicator ? RadioCard.ItemContent : React.Fragment
  const contentWrapperProps = indicator ? { alignItems: contentAlignItems } : {}

  return (
    <RadioCard.Item {...rest}>
      <RadioCard.ItemHiddenInput ref={ref} {...inputProps} />
      <RadioCard.ItemControl>
        {indicatorPlacement === "start" && indicator}
        {hasContent && (
          <ContentWrapper {...contentWrapperProps}>
            {icon}
            {label && <RadioCard.ItemText>{label}</RadioCard.ItemText>}
            {description && (
              <RadioCard.ItemDescription>
                {description}
              </RadioCard.ItemDescription>
            )}
            {indicatorPlacement === "inside" && indicator}
          </ContentWrapper>
        )}
        {indicatorPlacement === "end" && indicator}
      </RadioCard.ItemControl>
      {addon && <RadioCard.ItemAddon>{addon}</RadioCard.ItemAddon>}
    </RadioCard.Item>
  )
})

export const RadioCardRoot = RadioCard.Root
export const RadioCardLabel = RadioCard.Label
export const RadioCardItemIndicator = RadioCard.ItemIndicator
