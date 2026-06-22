import { Schema } from "effect"
import { AllAttributes } from "./stats.js"

export const RoleId = Schema.Literal("virgin")
export type RoleId = typeof RoleId.Type

export const Role = Schema.Struct({
  id: RoleId,
  letter: Schema.String,
  name: Schema.String,
  attributes: AllAttributes,
  startingInventory: Schema.Array(Schema.String),
  equipment: Schema.Array(Schema.String)
})
export type Role = typeof Role.Type

export const balancedAttributes = {
  charisma: 10,
  constitution: 10,
  dexterity: 10,
  intelligence: 10,
  strength: 10,
  wisdom: 10
} as const

export const virginRole: Role = {
  id: "virgin",
  letter: "v",
  name: "virgin",
  attributes: balancedAttributes,
  startingInventory: [],
  equipment: []
}

export const roles: ReadonlyArray<Role> = [virginRole]

export const roleById = (roleId: RoleId): Role | undefined =>
  roles.find((role) => role.id === roleId)
