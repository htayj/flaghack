import { fixupPluginRules } from "@eslint/compat"
import { FlatCompat } from "@eslint/eslintrc"
import js from "@eslint/js"
import tsParser from "@typescript-eslint/parser"
import codegen from "eslint-plugin-codegen"
import _import from "eslint-plugin-import"
import simpleImportSort from "eslint-plugin-simple-import-sort"
import sortDestructureKeys from "eslint-plugin-sort-destructure-keys"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

const effectFpSourceGlobs = [
  "packages/server/src/**/*.ts",
  "packages/domain/src/**/*.ts"
]

const effectFpSourceExcludedGlobs = [
  "packages/server/src/test*.ts",
  "packages/domain/src/test*.ts",
  "**/*.test.ts",
  "**/*.unit.test.ts",
  "**/*.bench.ts"
]

const noArrayPushSpreadRestriction = {
  selector:
    "CallExpression[callee.property.name='push'] > SpreadElement.arguments",
  message: "Do not use spread arguments in Array.push"
}

const keyGeneratorMessage =
  "Use the Effect-backed KeyGenerator service or an injected Effect service instead of randomUUID in backend/domain source."

const staticPropertyName = (property) => {
  if (property?.type === "Identifier") return property.name
  if (property?.type === "Literal" && typeof property.value === "string") {
    return property.value
  }
  if (
    property?.type === "TemplateLiteral"
    && property.expressions.length === 0
  ) {
    return property.quasis.map((quasi) => quasi.value.cooked).join("")
  }
  return undefined
}

const importSpecifierName = (specifier) => {
  if (specifier?.imported?.type === "Identifier") {
    return specifier.imported.name
  }
  if (specifier?.imported?.type === "Literal") {
    return specifier.imported.value
  }
  return undefined
}

const isEffectImportSource = (source) =>
  source === "effect" || source === "effect/Effect"

const sourceCodeForContext = (context) =>
  context.sourceCode ?? context.getSourceCode()

const scopeForNode = (context, node) => {
  const sourceCode = sourceCodeForContext(context)
  if (typeof sourceCode.getScope === "function") {
    return sourceCode.getScope(node)
  }
  return context.getScope()
}

const resolveIdentifierVariable = (context, identifier) => {
  let scope = scopeForNode(context, identifier)
  while (scope !== null && scope !== undefined) {
    const variable = scope.set?.get(identifier.name)
    if (variable !== undefined) return variable
    scope = scope.upper
  }
  return undefined
}

const importDeclarationForDefinition = (definition) => {
  if (definition.parent?.type === "ImportDeclaration") {
    return definition.parent
  }
  if (definition.node?.parent?.type === "ImportDeclaration") {
    return definition.node.parent
  }
  return undefined
}

const isRuntimeImportDefinition = (definition) => {
  const importDeclaration = importDeclarationForDefinition(definition)
  if (!isEffectImportSource(importDeclaration?.source?.value)) return false
  return importDeclaration.importKind !== "type"
    && definition.node?.importKind !== "type"
}

const variableHasEffectImport = (variable, matchesSpecifier) =>
  variable?.defs?.some((definition) =>
    isRuntimeImportDefinition(definition)
    && matchesSpecifier(definition.node)
  ) === true

const isEffectNamespaceSpecifier = (specifier) =>
  specifier?.type === "ImportNamespaceSpecifier"
  || (specifier?.type === "ImportSpecifier"
    && importSpecifierName(specifier) === "Effect")

const isEffectTryPromiseSpecifier = (specifier) =>
  specifier?.type === "ImportSpecifier"
  && importSpecifierName(specifier) === "tryPromise"

const isImportedEffectNamespaceIdentifier = (context, identifier) =>
  variableHasEffectImport(
    resolveIdentifierVariable(context, identifier),
    isEffectNamespaceSpecifier
  )

const isImportedEffectTryPromiseIdentifier = (context, identifier) =>
  variableHasEffectImport(
    resolveIdentifierVariable(context, identifier),
    isEffectTryPromiseSpecifier
  )

const importedEffectTryPromiseCallee = (context, callee) => {
  if (callee?.type === "Identifier") {
    return isImportedEffectTryPromiseIdentifier(context, callee)
  }
  if (callee?.type !== "MemberExpression") return false
  return callee.object?.type === "Identifier"
    && isImportedEffectNamespaceIdentifier(context, callee.object)
    && staticPropertyName(callee.property) === "tryPromise"
}

const isEffectTryPromiseAsyncBoundary = (
  node,
  isEffectTryPromiseCallee
) => {
  const parent = node.parent
  if (
    parent?.type === "CallExpression"
    && parent.arguments.includes(node)
    && isEffectTryPromiseCallee(parent.callee)
  ) return true

  if (parent?.type !== "Property" || parent.value !== node) return false
  if (staticPropertyName(parent.key) !== "try") return false

  const objectExpression = parent.parent
  const callExpression = objectExpression?.parent
  return objectExpression?.type === "ObjectExpression"
    && callExpression?.type === "CallExpression"
    && callExpression.arguments.includes(objectExpression)
    && isEffectTryPromiseCallee(callExpression.callee)
}

const flagHackLintPlugin = {
  rules: {
    "effect-async-boundaries": {
      meta: {
        type: "problem",
        messages: {
          rawAsync:
            "Model backend/domain async APIs as Effect values instead of raw async functions; async callbacks inside Effect.tryPromise boundaries are allowed."
        }
      },
      create: (context) => {
        const isEffectTryPromiseCallee = (callee) =>
          importedEffectTryPromiseCallee(context, callee)
        const checkAsyncFunction = (node) => {
          if (
            !node.async
            || isEffectTryPromiseAsyncBoundary(
              node,
              isEffectTryPromiseCallee
            )
          ) return
          context.report({ node, messageId: "rawAsync" })
        }

        return {
          ArrowFunctionExpression: checkAsyncFunction,
          FunctionDeclaration: checkAsyncFunction,
          FunctionExpression: checkAsyncFunction
        }
      }
    },
    "effect-key-generation": {
      meta: {
        type: "problem",
        messages: {
          randomUuid: keyGeneratorMessage
        }
      },
      create: (context) => {
        const reportRandomUuid = (node) =>
          context.report({ node, messageId: "randomUuid" })

        return {
          CallExpression: (node) => {
            if (
              node.callee?.type === "Identifier"
              && node.callee.name === "randomUUID"
            ) {
              reportRandomUuid(node.callee)
            }
          },
          MemberExpression: (node) => {
            if (staticPropertyName(node.property) === "randomUUID") {
              reportRandomUuid(node.property)
            }
          },
          Property: (node) => {
            if (
              node.parent?.type === "ObjectPattern"
              && staticPropertyName(node.key) === "randomUUID"
            ) reportRandomUuid(node.key)
          }
        }
      }
    }
  }
}

const backendDomainEffectFpRestrictions = {
  files: effectFpSourceGlobs,
  ignores: effectFpSourceExcludedGlobs,
  rules: {
    "no-restricted-imports": ["error", {
      paths: [
        {
          name: "node:crypto",
          importNames: ["randomUUID", "webcrypto"],
          message: keyGeneratorMessage
        },
        {
          name: "crypto",
          importNames: ["randomUUID", "webcrypto"],
          message: keyGeneratorMessage
        }
      ]
    }],
    "no-restricted-properties": ["error", {
      object: "Math",
      property: "random",
      message:
        "Use Effect Random or an injected Effect service instead of Math.random in backend/domain source."
    }, {
      object: "crypto",
      property: "randomUUID",
      message: keyGeneratorMessage
    }, {
      object: "webcrypto",
      property: "randomUUID",
      message: keyGeneratorMessage
    }],
    "flaghack/effect-async-boundaries": "error",
    "flaghack/effect-key-generation": "error",
    "no-restricted-syntax": ["error", noArrayPushSpreadRestriction, {
      selector:
        "MemberExpression[property.name='randomUUID'], MemberExpression[property.value='randomUUID']",
      message: keyGeneratorMessage
    }, {
      selector:
        "VariableDeclarator[id.type='ObjectPattern'] Property[key.name='randomUUID'], VariableDeclarator[id.type='ObjectPattern'] Property[key.value='randomUUID']",
      message: keyGeneratorMessage
    }, {
      selector: "CallExpression[callee.name='randomUUID']",
      message: keyGeneratorMessage
    }, {
      selector:
        "CallExpression[callee.property.name='then'], CallExpression[callee.property.name='catch'], CallExpression[callee.property.name='finally']",
      message:
        "Use Effect.flatMap/catchAll/ensuring instead of raw Promise chains in backend/domain source."
    }, {
      selector: "NewExpression[callee.name='Promise']",
      message:
        "Use Effect.async or Effect.tryPromise instead of constructing raw Promises in backend/domain source."
    }, {
      selector: "CallExpression[callee.object.name='Promise']",
      message:
        "Use Effect.all or Effect.tryPromise instead of raw Promise helpers in backend/domain source."
    }, {
      selector:
        "ThrowStatement[argument.type='NewExpression'][argument.callee.name='Error']",
      message:
        "Model expected backend/domain failures with Effect.fail and Data.TaggedError instead of throw new Error."
    }]
  }
}

export default [
  {
    ignores: [
      "**/node_modules",
      "**/*-lock.json",
      ".pi/schedule-prompts.json",
      ".pi/dev-suite/task-graph/current.json",
      ".pi/dev-suite/task-graph/runs/**",
      ".pi/dev-suite/task-graph/artifacts/**",
      ".pi/task-graph-artifacts/**",
      "packages/**/build/**",
      "packages/**/dist/**",
      "**/*.d.ts",
      "**/*.d.ts.map",
      "**/*.js.map",
      "packages/domain/src/schemas/*.js",
      "pnpm-lock.yaml",
      "**/*~",
      "**/#*#",
      "**/.#*",
      "**/docs",
      "**/*.md"
    ]
  },
  ...compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@effect/recommended"
  ),
  {
    plugins: {
      import: fixupPluginRules(_import),
      "sort-destructure-keys": sortDestructureKeys,
      "simple-import-sort": simpleImportSort,
      codegen,
      flaghack: flagHackLintPlugin
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2018,
      sourceType: "module"
    },

    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"]
      },

      "import/resolver": {
        typescript: {
          alwaysTryTypes: true
        }
      }
    },

    rules: {
      "codegen/codegen": "error",
      "no-fallthrough": "off",
      "no-irregular-whitespace": "off",
      "object-shorthand": "error",
      "prefer-destructuring": "off",
      "sort-imports": "off",

      "no-restricted-syntax": ["error", noArrayPushSpreadRestriction],

      "no-unused-vars": "off",
      "prefer-rest-params": "off",
      "prefer-spread": "off",
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",
      "import/no-unresolved": "off",
      "import/order": "off",
      "simple-import-sort/imports": "off",
      "sort-destructure-keys/sort-destructure-keys": "error",
      "deprecation/deprecation": "off",

      "@typescript-eslint/array-type": ["warn", {
        default: "generic",
        readonly: "generic"
      }],

      "@typescript-eslint/member-delimiter-style": 0,
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-types": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/consistent-type-imports": "warn",

      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_"
      }],

      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/camelcase": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/no-array-constructor": "off",
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-namespace": "off",

      "@effect/dprint": ["error", {
        config: {
          indentWidth: 2,
          lineWidth: 75,
          semiColons: "asi",
          quoteStyle: "alwaysDouble",
          trailingCommas: "never",
          operatorPosition: "nextLine",
          spaceAround: false,
          "arrowFunction.useParentheses": "force"
        }
      }]
    }
  },
  backendDomainEffectFpRestrictions
]
