import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ChainRaiseModule", (moduleBuilder) => {
  const chainRaise = moduleBuilder.contract("ChainRaise");
  return { chainRaise };
});
