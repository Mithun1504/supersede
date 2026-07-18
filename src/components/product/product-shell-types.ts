export type ProductViewer = {
  displayName: string;
  organizationReady: boolean;
  authenticated: boolean;
};

export type ProductShellWorkspace = {
  organizationName: string;
  configuration: "propagate" | "displace";
  changeReference: string;
  reviewCount: number;
};
