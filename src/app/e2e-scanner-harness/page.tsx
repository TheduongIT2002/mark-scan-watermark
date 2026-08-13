import {notFound} from "next/navigation";
import ScannerTestHarness from "@/components/test-support/scanner-test-harness";
export default function ScannerTestPage(){if(process.env.MARKSCAN_E2E_SCANNER!=="1")notFound();return <ScannerTestHarness/>;}
